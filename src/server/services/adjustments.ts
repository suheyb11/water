// Corrections and other customer account documents. Posted documents are never edited; each correction is its
// own document with a reference and a ledger entry.
//   Debit note        → extra charge / debit adjustment / price adjustment upwards   (Invoice kind DEBIT_NOTE)
//   Credit adjustment → price adjustment downwards, goodwill, write-off            (CreditNote kind ADJUSTMENT)
//   Return            → products brought back, at the price on the original invoice (CreditNote kind RETURN)
//   Refund            → money paid back out of the customer's credit               (Invoice kind REFUND + Refund)
//   Opening balance   → debt (Invoice OPENING_BALANCE) or credit (CreditNote OPENING_BALANCE) brought forward
import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { D, money, qty as roundQty, sum, toDb, type Decimal } from "@/lib/money";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { allocate, applyCreditFifo, autoAllocate, invoiceStatus, lockCustomer, outstandingOf, postLedger, unallocatedCredit } from "./posting";
import { getSettings } from "./settings";
import { moveStockTx } from "./inventory";
import { checkDate } from "./sales";

const positive = z.union([z.string(), z.number()]).transform(v => money(D(String(v).trim() || "0")))
  .refine(v => v.greaterThan(0), "Amount must be more than zero");
const isoOpt = z.string().refine(isIsoDate, "Invalid date").optional();

async function customerSnapshot(tx: Tx, customerId: number) {
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
  return { customerName: c.name, customerPhone: c.phone };
}

/** Opening balance at registration. Positive = customer owes; negative = customer has credit. */
export async function postOpeningBalanceTx(tx: Tx, actor: Actor, customerId: number, amountIn: Decimal, date: string) {
  const settings = await getSettings(tx);
  await lockCustomer(tx, customerId);
  const amount = money(amountIn.abs());
  if (amount.isZero()) return null;
  if (amountIn.greaterThan(0)) {
    const number = await nextNumber(tx, "INV", settings.invoicePrefix, Number(date.slice(0, 4)));
    const inv = await tx.invoice.create({
      data: {
        number, kind: "OPENING_BALANCE", customerId, invoiceDate: dbDate(date), dueDate: dbDate(date), status: "UNPAID",
        subtotal: toDb(amount), total: toDb(amount), notes: "Opening balance brought forward", ...(await customerSnapshot(tx, customerId)), createdById: actor.userId,
      },
    });
    await postLedger(tx, actor, { customerId, txDate: date, type: "OPENING_BALANCE", debit: amount, reference: number, invoiceId: inv.id, description: "Opening balance (amount owed brought forward)" });
    await autoAllocate(tx, actor, customerId, date);
    return inv;
  }
  const number = await nextNumber(tx, "CN", settings.creditNotePrefix, Number(date.slice(0, 4)));
  const cn = await tx.creditNote.create({ data: { number, kind: "OPENING_BALANCE", customerId, noteDate: dbDate(date), amount: toDb(amount), reason: "Opening credit balance brought forward", createdById: actor.userId } });
  await postLedger(tx, actor, { customerId, txDate: date, type: "OPENING_CREDIT", credit: amount, reference: number, creditNoteId: cn.id, description: "Opening balance (customer credit brought forward)" });
  await autoAllocate(tx, actor, customerId, date);
  return cn;
}

export const debitNoteInput = z.object({
  customerId: z.coerce.number().int().positive(),
  amount: positive,
  reason: z.string().trim().min(3, "Give the reason").max(400),
  relatedInvoiceId: z.coerce.number().int().positive().optional().nullable(),
  date: isoOpt,
  dueDate: isoOpt.nullable(),
});

/** Additional charge or debit adjustment (e.g. a price correction upwards on an earlier invoice). */
export async function createDebitNote(actor: Actor, raw: z.input<typeof debitNoteInput>) {
  assertCan(actor, "ledger.adjust");
  const input = debitNoteInput.parse(raw);
  const date = input.date ?? todayIso();
  checkDate(actor, date, "debit note");
  return inTx(async tx => {
    const settings = await getSettings(tx);
    await lockCustomer(tx, input.customerId);
    if (input.relatedInvoiceId) {
      const rel = await tx.invoice.findUnique({ where: { id: input.relatedInvoiceId } });
      if (!rel || rel.customerId !== input.customerId) fail("Related invoice not found for this customer");
    }
    const number = await nextNumber(tx, "INV", settings.invoicePrefix, Number(date.slice(0, 4)));
    const inv = await tx.invoice.create({
      data: {
        number, kind: "DEBIT_NOTE", customerId: input.customerId, invoiceDate: dbDate(date), dueDate: dbDate(input.dueDate ?? date), status: "UNPAID",
        subtotal: toDb(input.amount), charges: "0", total: toDb(input.amount), relatedInvoiceId: input.relatedInvoiceId ?? null, notes: input.reason,
        ...(await customerSnapshot(tx, input.customerId)), createdById: actor.userId,
      },
    });
    await postLedger(tx, actor, { customerId: input.customerId, txDate: date, type: "DEBIT_NOTE", debit: input.amount, reference: number, invoiceId: inv.id, description: `Debit adjustment: ${input.reason}` });
    await autoAllocate(tx, actor, input.customerId, date, [inv.id]);
    await audit(tx, actor, "debit_note.create", "Invoice", inv.id, `${number} ${input.amount.toFixed(2)}: ${input.reason}`, null, inv);
    return tx.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  });
}

export const creditAdjustmentInput = z.object({
  customerId: z.coerce.number().int().positive(),
  amount: positive,
  reason: z.string().trim().min(3, "Give the reason").max(400),
  invoiceId: z.coerce.number().int().positive().optional().nullable(),
  date: isoOpt,
});

/** Credit adjustment: lowers what the customer owes (price adjustment after invoicing, goodwill, write-off). */
export async function createCreditAdjustment(actor: Actor, raw: z.input<typeof creditAdjustmentInput>) {
  assertCan(actor, "ledger.adjust");
  const input = creditAdjustmentInput.parse(raw);
  const date = input.date ?? todayIso();
  checkDate(actor, date, "credit note");
  return inTx(async tx => {
    const settings = await getSettings(tx);
    await lockCustomer(tx, input.customerId);
    let invoice = null;
    if (input.invoiceId) {
      invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice || invoice.customerId !== input.customerId) fail("Invoice not found for this customer");
      if (invoice!.status === "CANCELLED") fail(`${invoice!.number} is cancelled`);
    }
    const number = await nextNumber(tx, "CN", settings.creditNotePrefix, Number(date.slice(0, 4)));
    const cn = await tx.creditNote.create({ data: { number, kind: "ADJUSTMENT", customerId: input.customerId, invoiceId: input.invoiceId ?? null, noteDate: dbDate(date), amount: toDb(input.amount), reason: input.reason, createdById: actor.userId } });
    await postLedger(tx, actor, { customerId: input.customerId, txDate: date, type: "CREDIT_NOTE", credit: input.amount, reference: number, creditNoteId: cn.id, invoiceId: input.invoiceId ?? null, description: `Credit adjustment${invoice ? ` on ${invoice.number}` : ""}: ${input.reason}` });
    let left = input.amount;
    if (invoice) {
      const take = Decimal_min(left, outstandingOf(invoice));
      if (take.greaterThan(0)) { await allocate(tx, actor, invoice.id, { creditNoteId: cn.id }, take, date); left = left.minus(take); }
    }
    if (left.greaterThan(0)) await applyCreditFifo(tx, actor, input.customerId, { creditNoteId: cn.id }, left, date);
    await audit(tx, actor, "credit_note.create", "CreditNote", cn.id, `${number} ${input.amount.toFixed(2)}: ${input.reason}`, null, cn);
    return tx.creditNote.findUniqueOrThrow({ where: { id: cn.id } });
  });
}

export const returnInput = z.object({
  invoiceId: z.coerce.number().int().positive(),
  items: z.array(z.object({
    invoiceItemId: z.coerce.number().int().positive(),
    quantity: z.union([z.string(), z.number()]).transform(v => roundQty(D(String(v) || "0"))),
    restock: z.boolean().optional().default(true),
  })).min(1),
  reason: z.string().trim().min(3, "Give the reason").max(400),
  date: isoOpt,
});

/** Products returned from an invoice: credited at the price actually charged on that invoice, back into stock. */
export async function createReturn(actor: Actor, raw: z.input<typeof returnInput>) {
  assertCan(actor, "ledger.adjust");
  const input = returnInput.parse(raw);
  const date = input.date ?? todayIso();
  checkDate(actor, date, "return");
  return inTx(async tx => {
    const settings = await getSettings(tx);
    const inv0 = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv0) return notFound("Invoice");
    await lockCustomer(tx, inv0.customerId);
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { items: true } });
    if (inv.kind !== "SALE") fail("Only sales can have returns");
    if (inv.status === "CANCELLED") fail(`${inv.number} is cancelled`);
    const lines = [];
    for (const r of input.items.filter(i => i.quantity.greaterThan(0))) {
      const item = inv.items.find(i => i.id === r.invoiceItemId);
      if (!item) return fail("Return line not on this invoice");
      const free = D(item.quantity).minus(item.quantityReturned);
      if (r.quantity.greaterThan(free)) fail(`Only ${free.toString()} of ${item.productName} can still be returned`);
      // the credit follows the net price actually paid: spread any invoice discount/charges proportionally
      const share = D(inv.subtotal).isZero() ? D(1) : D(inv.total).div(inv.subtotal);
      const unit = D(item.unitPrice).mul(share);
      lines.push({ item, quantity: r.quantity, restock: r.restock, unitPrice: unit, lineTotal: money(r.quantity.mul(unit)) });
    }
    if (!lines.length) fail("Enter the quantity returned");
    const amount = money(sum(lines.map(l => l.lineTotal)));
    const number = await nextNumber(tx, "CN", settings.creditNotePrefix, Number(date.slice(0, 4)));
    const cn = await tx.creditNote.create({
      data: {
        number, kind: "RETURN", customerId: inv.customerId, invoiceId: inv.id, noteDate: dbDate(date), amount: toDb(amount), reason: input.reason, createdById: actor.userId,
        items: { create: lines.map(l => ({ invoiceItemId: l.item.id, productId: l.item.productId, productName: l.item.productName, quantity: toDb(l.quantity, 3), unitPrice: toDb(l.unitPrice, 4), lineTotal: toDb(l.lineTotal), restock: l.restock })) },
      },
    });
    for (const l of lines) {
      await tx.invoiceItem.update({ where: { id: l.item.id }, data: { quantityReturned: toDb(D(l.item.quantityReturned).plus(l.quantity), 3) } });
      if (l.restock) await moveStockTx(tx, actor, { productId: l.item.productId, type: "RETURN", quantity: l.quantity, date, reference: number, invoiceId: inv.id, creditNoteId: cn.id, allowNegative: true });
    }
    if (amount.greaterThan(0)) {
      await postLedger(tx, actor, { customerId: inv.customerId, txDate: date, type: "RETURN", credit: amount, reference: number, creditNoteId: cn.id, invoiceId: inv.id, description: `Return on ${inv.number}: ${lines.map(l => `${l.quantity.toString()} × ${l.item.productName}`).join(", ")}` });
      const take = Decimal_min(amount, outstandingOf(inv));
      if (take.greaterThan(0)) await allocate(tx, actor, inv.id, { creditNoteId: cn.id }, take, date);
      const left = money(amount.minus(take));
      if (left.greaterThan(0)) await applyCreditFifo(tx, actor, inv.customerId, { creditNoteId: cn.id }, left, date);
    }
    await audit(tx, actor, "return.create", "CreditNote", cn.id, `${number} return on ${inv.number}, credit ${amount.toFixed(2)}`, null, { cn, lines: lines.map(l => ({ item: l.item.id, q: l.quantity.toString() })) });
    return tx.creditNote.findUniqueOrThrow({ where: { id: cn.id } });
  });
}

export const refundInput = z.object({
  customerId: z.coerce.number().int().positive(),
  amount: positive,
  methodId: z.coerce.number().int().positive("Choose how the money is paid back"),
  reference: z.string().trim().max(120).optional().nullable(),
  reason: z.string().trim().min(3, "Give the reason").max(400),
  date: isoOpt,
});

/** Pay money back to a customer out of their advance credit. Cannot exceed the free credit. */
export async function createRefund(actor: Actor, raw: z.input<typeof refundInput>) {
  assertCan(actor, "ledger.adjust");
  const input = refundInput.parse(raw);
  const date = input.date ?? todayIso();
  checkDate(actor, date, "refund");
  return inTx(async tx => {
    const settings = await getSettings(tx);
    const customer = await lockCustomer(tx, input.customerId);
    const free = await unallocatedCredit(tx, customer.id);
    if (input.amount.greaterThan(free)) fail(`${customer.name} has only ${free.toFixed(2)} of credit available to refund`);
    if (input.amount.greaterThan(D(customer.balance).neg())) fail(`${customer.name}'s account does not show a credit of ${input.amount.toFixed(2)}`);
    const method = await tx.paymentMethod.findUnique({ where: { id: input.methodId } });
    if (!method) return fail("Unknown payment method");
    const number = await nextNumber(tx, "INV", settings.invoicePrefix, Number(date.slice(0, 4)));
    const inv = await tx.invoice.create({
      data: {
        number, kind: "REFUND", customerId: customer.id, invoiceDate: dbDate(date), dueDate: dbDate(date), status: "UNPAID", subtotal: toDb(input.amount), total: toDb(input.amount),
        notes: `Refund: ${input.reason}`, customerName: customer.name, customerPhone: customer.phone, createdById: actor.userId,
      },
    });
    const refund = await tx.refund.create({ data: { customerId: customer.id, invoiceId: inv.id, refundDate: dbDate(date), amount: toDb(input.amount), methodId: method.id, reference: input.reference ?? null, reason: input.reason, createdById: actor.userId } });
    await postLedger(tx, actor, { customerId: customer.id, txDate: date, type: "REFUND", debit: input.amount, reference: number, invoiceId: inv.id, refundId: refund.id, description: `Refund paid (${method.name}): ${input.reason}` });
    const applied = await autoAllocate(tx, actor, customer.id, date, [inv.id]);
    if (!applied.equals(input.amount)) fail("Could not cover the refund from the customer's credit");
    await audit(tx, actor, "refund.create", "Refund", refund.id, `${number} refund ${input.amount.toFixed(2)} to ${customer.name}`, null, refund);
    return refund;
  });
}

function Decimal_min(a: Decimal, b: Decimal) { return a.lessThan(b) ? a : b; }

export async function getCreditNote(id: number) {
  return prisma.creditNote.findUnique({ where: { id }, include: { items: true, customer: true, invoice: { select: { id: true, number: true } }, allocations: { include: { invoice: { select: { id: true, number: true } } } }, createdBy: { select: { fullName: true } } } });
}

export { invoiceStatus };
