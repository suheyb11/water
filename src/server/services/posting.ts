// Core of the customer financial ledger.
//
// Accounting convention (customer account, receivable side):
//   balance = Σ debit − Σ credit       positive → customer owes us, negative → customer has advance credit
//   debit:  sale, debit note / charge, opening debt, refund paid out, payment reversal
//   credit: payment, credit note / adjustment, product return, opening credit, invoice cancellation
//
// Sub-ledger invariant (checked by reconciliation):
//   balance = Σ outstanding of open receivables − Σ unallocated credit (payments + credit notes)
//
// Every function here must be called inside a transaction (inTx) AFTER lockCustomer().
import type { Tx } from "../db";
import type { Actor } from "../actor";
import { fail } from "../errors";
import { D, money, min, toDb, type Decimal, type Num } from "@/lib/money";
import { dbDate } from "@/lib/dates";
import type { LedgerType } from "@/lib/constants";
import { closeSettledReminders } from "./reminders";

/**
 * Take the per-customer posting lock: the UPDATE holds an exclusive row lock until the transaction ends, so two
 * postings for the same customer run one after the other and the balance/sequence they read is current.
 */
export async function lockCustomer(tx: Tx, customerId: number) {
  try {
    return await tx.customer.update({ where: { id: customerId }, data: { lockVersion: { increment: 1 } } });
  } catch {
    return fail("Customer not found", "NOT_FOUND");
  }
}

export interface LedgerInput {
  customerId: number;
  txDate: string;
  type: LedgerType;
  debit?: Num;
  credit?: Num;
  reference: string;
  description: string;
  invoiceId?: number | null;
  paymentId?: number | null;
  creditNoteId?: number | null;
  refundId?: number | null;
}

export async function postLedger(tx: Tx, actor: Actor, e: LedgerInput) {
  const debit = money(e.debit ?? 0);
  const credit = money(e.credit ?? 0);
  if (debit.isNegative() || credit.isNegative()) fail("Ledger amounts cannot be negative");
  if (debit.isZero() === credit.isZero()) fail("A ledger entry needs exactly one of debit or credit");
  const cust = await tx.customer.findUniqueOrThrow({ where: { id: e.customerId }, select: { balance: true } });
  const last = await tx.ledgerEntry.findFirst({ where: { customerId: e.customerId }, orderBy: { seq: "desc" }, select: { seq: true, balanceAfter: true } });
  const prev = D(cust.balance);
  if (last && !D(last.balanceAfter).equals(prev)) fail(`Ledger out of balance for customer #${e.customerId}; run reconciliation`, "INTEGRITY");
  const balanceAfter = money(prev.plus(debit).minus(credit));
  const row = await tx.ledgerEntry.create({
    data: {
      customerId: e.customerId,
      seq: (last?.seq ?? 0) + 1,
      txDate: dbDate(e.txDate),
      type: e.type,
      debit: toDb(debit),
      credit: toDb(credit),
      balanceAfter: toDb(balanceAfter),
      reference: e.reference,
      description: e.description.slice(0, 400),
      invoiceId: e.invoiceId ?? null,
      paymentId: e.paymentId ?? null,
      creditNoteId: e.creditNoteId ?? null,
      refundId: e.refundId ?? null,
      createdById: actor.userId,
    },
  });
  await tx.customer.update({ where: { id: e.customerId }, data: { balance: toDb(balanceAfter) } });
  // money in that settles the account closes the "call me about the payment" reminders
  if (credit.greaterThan(0)) await closeSettledReminders(tx, e.customerId, balanceAfter, actor.userId);
  return row;
}

export function invoiceStatus(total: Num, settled: Num): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  const t = D(total), s = D(settled);
  if (s.greaterThanOrEqualTo(t)) return "PAID";
  if (s.greaterThan(0)) return "PARTIALLY_PAID";
  return "UNPAID";
}

export function outstandingOf(inv: { total: Num; amountSettled: Num; status?: string }) {
  if (inv.status === "CANCELLED") return D(0);
  return money(D(inv.total).minus(D(inv.amountSettled)));
}

type Source = { paymentId: number; creditNoteId?: never } | { creditNoteId: number; paymentId?: never };

/** Apply part of a credit to a receivable. Guards against over-allocation on both sides. */
export async function allocate(tx: Tx, actor: Actor, invoiceId: number, source: Source, amountIn: Num, dateIso: string): Promise<Decimal> {
  const amount = money(amountIn);
  if (!amount.greaterThan(0)) return D(0);
  const inv = await tx.invoice.update({ where: { id: invoiceId }, data: { lockVersion: { increment: 1 } } });
  if (inv.status === "CANCELLED") fail(`Invoice ${inv.number} is cancelled`);
  const open = outstandingOf(inv);
  if (amount.greaterThan(open)) fail(`Allocation ${amount.toFixed(2)} is more than the ${open.toFixed(2)} outstanding on ${inv.number}`);

  let customerId: number;
  if (source.paymentId) {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: source.paymentId } });
    if (p.status !== "POSTED") fail(`Payment ${p.number} is reversed`);
    const free = D(p.amount).minus(p.allocated);
    if (amount.greaterThan(free)) fail(`Payment ${p.number} has only ${free.toFixed(2)} left to allocate`);
    await tx.payment.update({ where: { id: p.id }, data: { allocated: toDb(D(p.allocated).plus(amount)) } });
    customerId = p.customerId;
  } else {
    const c = await tx.creditNote.findUniqueOrThrow({ where: { id: source.creditNoteId! } });
    const free = D(c.amount).minus(c.allocated);
    if (amount.greaterThan(free)) fail(`Credit note ${c.number} has only ${free.toFixed(2)} left to allocate`);
    await tx.creditNote.update({ where: { id: c.id }, data: { allocated: toDb(D(c.allocated).plus(amount)) } });
    customerId = c.customerId;
  }
  if (customerId !== inv.customerId) fail("A credit can only be applied to the same customer's invoices");

  await tx.allocation.create({
    data: { invoiceId, paymentId: source.paymentId ?? null, creditNoteId: source.creditNoteId ?? null, amount: toDb(amount), allocatedOn: dbDate(dateIso), createdById: actor.userId },
  });
  const settled = D(inv.amountSettled).plus(amount);
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountSettled: toDb(settled), status: invoiceStatus(inv.total, settled) } });
  return amount;
}

/** Undo all active allocations of an invoice (cancellation) or of a credit (payment reversal). */
export async function reverseAllocations(tx: Tx, actor: Actor, where: { invoiceId?: number; paymentId?: number; creditNoteId?: number }, reason: string) {
  const rows = await tx.allocation.findMany({ where: { ...where, reversedAt: null } });
  for (const a of rows) {
    await tx.allocation.update({ where: { id: a.id }, data: { reversedAt: new Date(), reversedById: actor.userId, reverseReason: reason.slice(0, 300) } });
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
    const settled = D(inv.amountSettled).minus(a.amount);
    await tx.invoice.update({
      where: { id: inv.id },
      data: { amountSettled: toDb(settled), ...(inv.status === "CANCELLED" ? {} : { status: invoiceStatus(inv.total, settled) }) },
    });
    if (a.paymentId) {
      const p = await tx.payment.findUniqueOrThrow({ where: { id: a.paymentId } });
      await tx.payment.update({ where: { id: p.id }, data: { allocated: toDb(D(p.allocated).minus(a.amount)) } });
    }
    if (a.creditNoteId) {
      const c = await tx.creditNote.findUniqueOrThrow({ where: { id: a.creditNoteId } });
      await tx.creditNote.update({ where: { id: c.id }, data: { allocated: toDb(D(c.allocated).minus(a.amount)) } });
    }
  }
  return rows.length;
}

export async function openReceivables(tx: Tx, customerId: number, exceptKinds: string[] = []) {
  return tx.invoice.findMany({
    where: { customerId, status: { in: ["UNPAID", "PARTIALLY_PAID"] }, ...(exceptKinds.length ? { kind: { notIn: exceptKinds } } : {}) },
    orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
  });
}

export async function openCredits(tx: Tx, customerId: number) {
  const [payments, notes] = await Promise.all([
    tx.payment.findMany({ where: { customerId, status: "POSTED" }, orderBy: [{ paymentDate: "asc" }, { id: "asc" }] }),
    tx.creditNote.findMany({ where: { customerId, status: "POSTED" }, orderBy: [{ noteDate: "asc" }, { id: "asc" }] }),
  ]);
  const credits = [
    ...notes.filter(n => D(n.amount).greaterThan(n.allocated)).map(n => ({ kind: "note" as const, id: n.id, number: n.number, date: n.noteDate, free: money(D(n.amount).minus(n.allocated)) })),
    ...payments.filter(p => D(p.amount).greaterThan(p.allocated)).map(p => ({ kind: "payment" as const, id: p.id, number: p.number, date: p.paymentDate, free: money(D(p.amount).minus(p.allocated)) })),
  ];
  // credit notes first (non-cash), then payments, each oldest first
  return credits;
}

export async function unallocatedCredit(tx: Tx, customerId: number) {
  const credits = await openCredits(tx, customerId);
  return money(credits.reduce((a, c) => a.plus(c.free), D(0)));
}

/** Apply a specific credit to a customer's open receivables, oldest first. Returns the amount applied. */
export async function applyCreditFifo(tx: Tx, actor: Actor, customerId: number, source: Source, available: Num, dateIso: string, onlyInvoiceIds?: number[]) {
  let left = money(available);
  let applied = D(0);
  const open = await openReceivables(tx, customerId);
  for (const inv of open) {
    if (!left.greaterThan(0)) break;
    if (onlyInvoiceIds && !onlyInvoiceIds.includes(inv.id)) continue;
    const take = min(left, outstandingOf(inv));
    if (!take.greaterThan(0)) continue;
    await allocate(tx, actor, inv.id, source, take, dateIso);
    left = left.minus(take);
    applied = applied.plus(take);
  }
  return money(applied);
}

/** Use all of a customer's unallocated credit against their open receivables (or only the given ones). */
export async function autoAllocate(tx: Tx, actor: Actor, customerId: number, dateIso: string, onlyInvoiceIds?: number[]) {
  const credits = await openCredits(tx, customerId);
  let total = D(0);
  for (const c of credits) {
    const src: Source = c.kind === "payment" ? { paymentId: c.id } : { creditNoteId: c.id };
    total = total.plus(await applyCreditFifo(tx, actor, customerId, src, c.free, dateIso, onlyInvoiceIds));
  }
  return money(total);
}
