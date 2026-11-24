import { z } from "zod";
import { prisma, inTx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { AppError, fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { D, money, sum, toDb } from "@/lib/money";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { allocate, applyCreditFifo, autoAllocate, lockCustomer, postLedger, reverseAllocations } from "./posting";
import { getSettings } from "./settings";
import { checkDate } from "./sales";

const money2 = z.union([z.string(), z.number()]).transform(v => D(String(v).trim() || "0"))
  .refine(v => v.isFinite(), "Enter an amount").transform(v => money(v));

export const paymentInput = z.object({
  customerId: z.coerce.number().int().positive("Select a customer"),
  amount: money2.refine(v => v.greaterThan(0), "Amount must be more than zero"),
  methodId: z.coerce.number().int().positive("Choose a payment method"),
  paymentDate: z.string().refine(isIsoDate, "Invalid date").optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable(),
  /** Explicit allocation to chosen invoices. Anything not allocated here follows `autoAllocate`. */
  allocations: z.array(z.object({ invoiceId: z.coerce.number().int().positive(), amount: money2 })).optional().default([]),
  /** true (default): the rest settles the oldest open invoices; false: the rest stays as advance credit. */
  autoAllocate: z.boolean().optional().default(true),
  idempotencyKey: z.string().trim().min(8).max(100).optional().nullable(),
});
export type PaymentInput = z.input<typeof paymentInput>;

/**
 * Record money received from a customer: full, partial, against several invoices, or in advance.
 * The ledger is credited once with the whole amount; allocations only say which invoices it settled.
 */
export async function recordPayment(actor: Actor, raw: PaymentInput) {
  assertCan(actor, "payments.create");
  const input = paymentInput.parse(raw);
  const date = input.paymentDate ?? todayIso();
  checkDate(actor, date, "payment");
  const explicit = input.allocations.filter(a => a.amount.greaterThan(0));
  const explicitTotal = money(sum(explicit.map(a => a.amount)));
  if (explicitTotal.greaterThan(input.amount)) fail(`Allocations (${explicitTotal.toFixed(2)}) are more than the payment (${input.amount.toFixed(2)})`, "VALIDATION", "allocations");
  if (new Set(explicit.map(a => a.invoiceId)).size !== explicit.length) fail("Each invoice can be allocated only once per payment", "VALIDATION", "allocations");

  if (input.idempotencyKey) {
    const done = await prisma.idempotencyKey.findUnique({ where: { key: `payment:${input.idempotencyKey}` } });
    if (done) return prisma.payment.findUniqueOrThrow({ where: { id: Number(done.resultId) } });
  }
  try {
    return await inTx(async tx => {
      const settings = await getSettings(tx);
      const customer = await lockCustomer(tx, input.customerId);
      const method = await tx.paymentMethod.findUnique({ where: { id: input.methodId } });
      if (!method || !method.isActive) fail("Unknown payment method", "VALIDATION", "methodId");
      const number = await nextNumber(tx, "RCPT", settings.receiptPrefix, Number(date.slice(0, 4)));
      const payment = await tx.payment.create({
        data: { number, customerId: customer.id, paymentDate: dbDate(date), amount: toDb(input.amount), methodId: input.methodId, reference: input.reference ?? null, notes: input.notes ?? null, createdById: actor.userId },
      });
      await postLedger(tx, actor, {
        customerId: customer.id, txDate: date, type: "PAYMENT", credit: input.amount, reference: number, paymentId: payment.id,
        description: `Payment received (${method!.name}${input.reference ? `, ref ${input.reference}` : ""})`,
      });
      for (const a of explicit) {
        const inv = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
        if (!inv || inv.customerId !== customer.id) fail("An allocated invoice does not belong to this customer", "VALIDATION", "allocations");
        await allocate(tx, actor, a.invoiceId, { paymentId: payment.id }, a.amount, date);
      }
      const left = money(input.amount.minus(explicitTotal));
      if (left.greaterThan(0) && input.autoAllocate) await applyCreditFifo(tx, actor, customer.id, { paymentId: payment.id }, left, date);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const advance = money(D(p.amount).minus(p.allocated));
      const final = await tx.payment.update({ where: { id: payment.id }, data: { advanceAtReceipt: toDb(advance) } });
      if (input.idempotencyKey) await tx.idempotencyKey.create({ data: { key: `payment:${input.idempotencyKey}`, operation: "payment", resultId: String(payment.id), userId: actor.userId } });
      await audit(tx, actor, "payment.record", "Payment", payment.id, `${number} ${customer.name} ${input.amount.toFixed(2)} via ${method!.name}${advance.greaterThan(0) ? ` (advance ${advance.toFixed(2)})` : ""}`, null, final);
      return final;
    });
  } catch (e) {
    if (input.idempotencyKey && (!(e instanceof AppError) || e.code === "DUPLICATE")) {
      const done = await prisma.idempotencyKey.findUnique({ where: { key: `payment:${input.idempotencyKey}` } });
      if (done) return prisma.payment.findUniqueOrThrow({ where: { id: Number(done.resultId) } });
    }
    throw e;
  }
}

export const reversePaymentInput = z.object({
  paymentId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, "Give the reason").max(400),
  date: z.string().refine(isIsoDate).optional(),
});

/** Reverse a payment entered by mistake or that bounced: allocations are undone and the ledger is debited back. */
export async function reversePayment(actor: Actor, raw: z.input<typeof reversePaymentInput>) {
  assertCan(actor, "payments.reverse");
  const input = reversePaymentInput.parse(raw);
  const date = input.date ?? todayIso();
  return inTx(async tx => {
    const p0 = await tx.payment.findUnique({ where: { id: input.paymentId } });
    if (!p0) return notFound("Payment");
    await lockCustomer(tx, p0.customerId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (p.status === "REVERSED") fail(`${p.number} is already reversed`);
    // money already paid back to the customer out of this payment cannot be reversed here
    const refundAllocs = await tx.allocation.findMany({ where: { paymentId: p.id, reversedAt: null, invoice: { kind: "REFUND" } } });
    if (refundAllocs.length) fail(`${p.number} was partly refunded to the customer; reverse is not possible`);
    await reverseAllocations(tx, actor, { paymentId: p.id }, `Payment ${p.number} reversed`);
    await tx.payment.update({ where: { id: p.id }, data: { status: "REVERSED", reversedAt: new Date(), reversedById: actor.userId, reverseReason: input.reason } });
    await postLedger(tx, actor, { customerId: p.customerId, txDate: date, type: "PAYMENT_REVERSAL", debit: p.amount, reference: p.number, paymentId: p.id, description: `Reversed ${p.number}: ${input.reason}` });
    // other free credits may now cover invoices that this payment had settled
    await autoAllocate(tx, actor, p.customerId, date);
    await audit(tx, actor, "payment.reverse", "Payment", p.id, `${p.number} reversed: ${input.reason}`, { status: p.status }, { status: "REVERSED" });
    return tx.payment.findUniqueOrThrow({ where: { id: p.id } });
  });
}

/** Apply a customer's free credit to their open invoices on request (e.g. after a payment kept as advance). */
export async function applyAvailableCredit(actor: Actor, customerId: number, invoiceIds?: number[]) {
  assertCan(actor, "payments.create");
  return inTx(async tx => {
    await lockCustomer(tx, customerId);
    const applied = await autoAllocate(tx, actor, customerId, todayIso(), invoiceIds);
    await audit(tx, actor, "credit.apply", "Customer", customerId, `Applied ${applied.toFixed(2)} of available credit to open invoices`);
    return applied;
  });
}

export async function getPayment(id: number) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      customer: { include: { addresses: { where: { isPrimary: true, isActive: true }, take: 1, include: { district: true, neighborhood: true, place: true } } } },
      method: true,
      createdBy: { select: { fullName: true } },
      allocations: { include: { invoice: { select: { id: true, number: true, invoiceDate: true, total: true, kind: true } } }, orderBy: { id: "asc" } },
    },
  });
}
