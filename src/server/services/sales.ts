// Posting a sale: one transaction that creates the invoice (with the price used frozen on every line), the
// ledger debit, the payment taken at the counter, the use of any advance credit, the stock movements, an optional
// delivery order and the audit record. If any step fails, nothing is saved.
import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan, can } from "../actor";
import { audit } from "../audit";
import { AppError, fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { D, money, price as roundPrice, qty as roundQty, sum, toDb } from "@/lib/money";
import { addDays, dbDate, isIsoDate, isoOf, todayIso } from "@/lib/dates";
import { addressFull } from "@/lib/address";
import { resolvePrice } from "./pricing";
import { allocate, applyCreditFifo, autoAllocate, invoiceStatus, lockCustomer, outstandingOf, postLedger, reverseAllocations } from "./posting";
import { moveStockTx, negativeStockAllowed } from "./inventory";
import { getSettings } from "./settings";
import { createDeliveryTx } from "./deliveries";
import { createReminderTx } from "./reminders";

const amount = z.union([z.string(), z.number()]).optional().nullable()
  .transform(v => (v === "" || v === null || v === undefined ? D(0) : D(String(v).trim())))
  .refine(v => v.isFinite() && !v.isNegative(), "Must be zero or more")
  .transform(v => money(v));

export const saleItemInput = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.union([z.string(), z.number()]).transform(v => D(String(v))).refine(v => v.isFinite() && v.greaterThan(0), "Quantity must be more than zero").transform(v => roundQty(v)),
  /** Only with sales.override_price; otherwise the engine's price is used. */
  unitPrice: z.union([z.string(), z.number(), z.null()]).optional().transform(v => (v === "" || v === null || v === undefined ? null : roundPrice(String(v))))
    .refine(v => v === null || !v.isNegative(), "Price cannot be negative"),
  overrideReason: z.string().trim().max(300).optional().nullable(),
});

export const saleInput = z.object({
  customerId: z.coerce.number().int().positive("Select a customer"),
  saleDate: z.string().refine(isIsoDate, "Invalid date").optional(),
  dueDate: z.string().refine(isIsoDate, "Invalid date").optional().nullable(),
  addressId: z.coerce.number().int().positive().optional().nullable(),
  items: z.array(saleItemInput).min(1, "Add at least one product"),
  discount: amount,
  charges: amount,
  chargesNote: z.string().trim().max(200).optional().nullable(),
  payment: z.object({
    amount,
    methodId: z.coerce.number().int().positive().optional().nullable(),
    reference: z.string().trim().max(120).optional().nullable(),
  }).optional().nullable(),
  applyCredit: z.boolean().optional().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(100).optional().nullable(),
  delivery: z.object({
    scheduledDate: z.string().refine(isIsoDate, "Invalid date").optional(),
    assignedToId: z.coerce.number().int().positive().optional().nullable(),
    notes: z.string().trim().max(600).optional().nullable(),
  }).optional().nullable(),
  /** "Call me later about the payment": creates a payment reminder for this invoice. */
  reminder: z.object({
    remindAt: z.string(),
    note: z.string().trim().max(600).optional().nullable(),
  }).optional().nullable(),
  /** Set by deliveries: invoice a delivery that was ordered without a sale. */
  fromDeliveryId: z.coerce.number().int().positive().optional().nullable(),
});
export type SaleInput = z.input<typeof saleInput>;

export interface SaleQuoteLine {
  productId: number; code: string; name: string; capacity: string; capacityUnit: string; saleUnit: string;
  quantity: string; resolvedPrice: string; unitPrice: string; source: string; lineTotal: string; defaultPrice: string;
}

/** Price a cart without saving anything (used by the sales screen as the cashier types). */
export async function quoteSale(customerId: number | null, items: { productId: number; quantity: string | number; unitPrice?: string | number | null }[], dateIso = todayIso()) {
  const lines: SaleQuoteLine[] = [];
  for (const it of items) {
    const product = await prisma.product.findUnique({ where: { id: Number(it.productId) } });
    if (!product) continue;
    const r = await resolvePrice(prisma, customerId, product.id, dateIso);
    const q = roundQty(D(String(it.quantity || 0)));
    const unit = it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== "" ? roundPrice(String(it.unitPrice)) : r.price;
    lines.push({
      productId: product.id, code: product.code, name: product.name, capacity: D(product.capacity).toString(), capacityUnit: product.capacityUnit,
      saleUnit: product.saleUnit, quantity: q.toString(), resolvedPrice: r.price.toFixed(4), unitPrice: unit.toFixed(4),
      source: unit.equals(r.price) ? r.source : "OVERRIDE", lineTotal: money(q.mul(unit)).toFixed(2), defaultPrice: r.defaultPrice.toFixed(4),
    });
  }
  return { lines, subtotal: money(sum(lines.map(l => l.lineTotal))).toFixed(2) };
}

async function checkIdempotency(tx: Tx, key: string | null | undefined, operation: string) {
  if (!key) return null;
  const hit = await tx.idempotencyKey.findUnique({ where: { key: `${operation}:${key}` } });
  return hit;
}

export function checkDate(actor: Actor, dateIso: string, what = "document") {
  const today = todayIso();
  if (dateIso > today) fail(`A ${what} cannot be dated in the future`, "VALIDATION");
  if (dateIso < today && !can(actor, "sales.backdate")) fail(`You may not post a ${what} with a past date`, "FORBIDDEN");
}

export async function postSale(actor: Actor, raw: SaleInput, opts: { deliveredReceivedBy?: string | null; deliveredNote?: string | null } = {}) {
  const input = saleInput.parse(raw);
  // delivery staff may invoice the delivery they are completing (cash on delivery), nothing else
  const onDelivery = !!input.fromDeliveryId && can(actor, "deliveries.update");
  if (!onDelivery) assertCan(actor, "sales.create");
  const saleDate = input.saleDate ?? todayIso();
  checkDate(actor, saleDate, "sale");
  if ((input.discount.greaterThan(0) || input.charges.greaterThan(0))) assertCan(actor, "sales.discount");
  const pay = input.payment && input.payment.amount.greaterThan(0) ? input.payment : null;
  if (pay) {
    if (!onDelivery) assertCan(actor, "payments.create");
    if (!pay.methodId) fail("Choose how the customer paid", "VALIDATION", "payment.methodId");
  }

  if (input.idempotencyKey) {
    const done = await prisma.idempotencyKey.findUnique({ where: { key: `sale:${input.idempotencyKey}` } });
    if (done) return prisma.invoice.findUniqueOrThrow({ where: { id: Number(done.resultId) } });
  }

  try {
    return await inTx(async tx => {
      if (await checkIdempotency(tx, input.idempotencyKey, "sale")) fail("This sale was already posted", "DUPLICATE");
      const settings = await getSettings(tx);
      const customer = await lockCustomer(tx, input.customerId);
      if (customer.status !== "ACTIVE") fail(`${customer.name} is inactive`);
      const address = input.addressId
        ? await tx.customerAddress.findFirst({ where: { id: input.addressId, customerId: customer.id }, include: { district: true, neighborhood: true, place: true } })
        : await tx.customerAddress.findFirst({ where: { customerId: customer.id, isActive: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], include: { district: true, neighborhood: true, place: true } });

      // 1. resolve prices and build lines (the price used is frozen on the line)
      const lines = [];
      let lineNo = 0;
      for (const it of input.items) {
        const product = await tx.product.findUnique({ where: { id: it.productId } });
        if (!product) return notFound(`Product #${it.productId}`);
        if (product.status !== "ACTIVE") fail(`${product.name} is not active`);
        const r = await resolvePrice(tx, customer.id, product.id, saleDate);
        let unitPrice = r.price;
        let source: string = r.source;
        let overrideReason: string | null = null;
        if (it.unitPrice !== null && !it.unitPrice.equals(r.price)) {
          assertCan(actor, "sales.override_price");
          if (!it.overrideReason) fail(`Give a reason for changing the price of ${product.name}`, "VALIDATION", "overrideReason");
          unitPrice = it.unitPrice;
          source = "OVERRIDE";
          overrideReason = it.overrideReason ?? null;
        }
        lines.push({
          lineNo: ++lineNo, productId: product.id, productCode: product.code, productName: product.name, capacity: D(product.capacity).toFixed(3),
          capacityUnit: product.capacityUnit, saleUnit: product.saleUnit, quantity: it.quantity, unitPrice, resolvedPrice: r.price, priceSource: source,
          priceRefId: r.refId, overrideReason, lineTotal: money(it.quantity.mul(unitPrice)), unitCost: D(product.costPrice),
        });
      }
      const subtotal = money(sum(lines.map(l => l.lineTotal)));
      if (input.discount.greaterThan(subtotal)) fail("The discount is bigger than the sale", "VALIDATION", "discount");
      const total = money(subtotal.minus(input.discount).plus(input.charges));
      const totalQuantity = roundQty(sum(lines.map(l => l.quantity)));

      // credit limit: the customer's balance after the sale and the counter payment
      if (customer.creditLimit !== null && D(customer.creditLimit).greaterThan(0)) {
        const after = D(customer.balance).plus(total).minus(pay?.amount ?? 0);
        if (after.greaterThan(customer.creditLimit) && !can(actor, "ledger.adjust")) {
          fail(`This sale takes ${customer.name} to ${after.toFixed(2)}, over the credit limit of ${D(customer.creditLimit).toFixed(2)}`, "CREDIT_LIMIT");
        }
      }

      // 2. invoice + items
      const number = await nextNumber(tx, "INV", settings.invoicePrefix, Number(saleDate.slice(0, 4)));
      const invoice = await tx.invoice.create({
        data: {
          number, kind: "SALE", customerId: customer.id, addressId: address?.id ?? null, invoiceDate: dbDate(saleDate),
          dueDate: dbDate(input.dueDate ?? addDays(saleDate, settings.paymentTermsDays)), status: invoiceStatus(total, 0),
          subtotal: toDb(subtotal), discount: toDb(input.discount), charges: toDb(input.charges), total: toDb(total), totalQuantity: toDb(totalQuantity, 3),
          notes: [input.notes, input.charges.greaterThan(0) && input.chargesNote ? `Charges: ${input.chargesNote}` : null].filter(Boolean).join("\n") || null,
          customerName: customer.name, customerPhone: customer.phone, addressText: address ? addressFull(address) : null, createdById: actor.userId,
          items: {
            create: lines.map(l => ({
              lineNo: l.lineNo, productId: l.productId, productCode: l.productCode, productName: l.productName, capacity: l.capacity,
              capacityUnit: l.capacityUnit, saleUnit: l.saleUnit, quantity: toDb(l.quantity, 3), unitPrice: toDb(l.unitPrice, 4),
              resolvedPrice: toDb(l.resolvedPrice, 4), priceSource: l.priceSource, priceRefId: l.priceRefId, overrideReason: l.overrideReason,
              lineTotal: toDb(l.lineTotal), unitCost: toDb(l.unitCost, 4),
            })),
          },
        },
      });

      // 3. ledger debit for the full sale
      if (total.greaterThan(0)) {
        await postLedger(tx, actor, { customerId: customer.id, txDate: saleDate, type: "SALE", debit: total, reference: number, invoiceId: invoice.id, description: `Sale ${number}: ${lines.map(l => `${l.quantity.toString()} × ${l.productName} @ ${l.unitPrice.toFixed(2)}`).join(", ")}`.slice(0, 400) });
      }

      // 4. existing advance credit first, then the money paid at the counter
      if (input.applyCredit) {
        const used = await autoAllocate(tx, actor, customer.id, saleDate, [invoice.id]);
        if (used.greaterThan(0)) await tx.invoice.update({ where: { id: invoice.id }, data: { creditAtSale: toDb(used) } });
      }
      let paymentId: number | null = null;
      if (pay) {
        const receipt = await nextNumber(tx, "RCPT", settings.receiptPrefix, Number(saleDate.slice(0, 4)));
        const method = await tx.paymentMethod.findUnique({ where: { id: pay.methodId! } });
        if (!method || !method.isActive) fail("Unknown payment method");
        const payment = await tx.payment.create({
          data: { number: receipt, customerId: customer.id, paymentDate: dbDate(saleDate), amount: toDb(pay.amount), methodId: method!.id, reference: pay.reference ?? null, receivedAtSale: true, saleInvoiceId: invoice.id, createdById: actor.userId },
        });
        paymentId = payment.id;
        await postLedger(tx, actor, { customerId: customer.id, txDate: saleDate, type: "PAYMENT", credit: pay.amount, reference: receipt, paymentId: payment.id, invoiceId: invoice.id, description: `Payment at sale ${number} (${method!.name})` });
        const cur = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
        const toThis = Decimal_min(pay.amount, outstandingOf(cur));
        if (toThis.greaterThan(0)) await allocate(tx, actor, invoice.id, { paymentId: payment.id }, toThis, saleDate);
        await tx.invoice.update({ where: { id: invoice.id }, data: { paidAtSale: toDb(toThis) } });
        // anything more settles older debts, the rest stays as advance credit
        const left = money(pay.amount.minus(toThis));
        if (left.greaterThan(0)) await applyCreditFifo(tx, actor, customer.id, { paymentId: payment.id }, left, saleDate);
        const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        await tx.payment.update({ where: { id: payment.id }, data: { advanceAtReceipt: toDb(D(p.amount).minus(p.allocated)) } });
      }

      // 5. stock
      const allowNeg = await negativeStockAllowed(tx, actor);
      for (const l of lines) {
        await moveStockTx(tx, actor, { productId: l.productId, type: "SALE", quantity: l.quantity, date: saleDate, reference: number, invoiceId: invoice.id, unitCost: l.unitCost, allowNegative: allowNeg });
      }

      // 6. delivery (optional) — linked by invoiceId, so it can never create a second sale
      if (input.fromDeliveryId) {
        const d = await tx.delivery.findUnique({ where: { id: input.fromDeliveryId } });
        if (!d || d.customerId !== customer.id) return fail("Delivery not found for this customer");
        if (d.invoiceId) fail(`Delivery ${d.number} is already invoiced`, "DUPLICATE");
        if (["DELIVERED", "CANCELLED"].includes(d.status)) fail(`Delivery ${d.number} is ${d.status.toLowerCase()}`);
        if (!can(actor, "deliveries.manage") && d.assignedToId !== actor.userId) fail("This delivery is not assigned to you", "FORBIDDEN");
        // invoicing a delivery order = completing it: the sale and the status change commit together
        await tx.delivery.update({ where: { id: d.id }, data: { invoiceId: invoice.id, status: "DELIVERED", deliveredAt: new Date(), receivedBy: opts.deliveredReceivedBy ?? null, confirmationNote: opts.deliveredNote ?? null } });
        await tx.deliveryEvent.create({ data: { deliveryId: d.id, fromStatus: d.status, toStatus: "DELIVERED", note: `Invoiced as ${number}${opts.deliveredNote ? `: ${opts.deliveredNote}` : ""}`, userId: actor.userId } });
      } else if (input.delivery) {
        await createDeliveryTx(tx, actor, {
          customerId: customer.id, addressId: address?.id ?? null, invoiceId: invoice.id, scheduledDate: input.delivery.scheduledDate ?? saleDate,
          assignedToId: input.delivery.assignedToId ?? null, notes: input.delivery.notes ?? null,
          items: lines.map(l => ({ productId: l.productId, quantity: l.quantity.toString() })),
        });
      }

      // 7. payment reminder ("call me later") when something is still owed
      if (input.reminder) {
        const due = await tx.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { balance: true } });
        if (D(due.balance).greaterThan(0)) {
          const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
          await createReminderTx(tx, actor, { customerId: customer.id, invoiceId: invoice.id, remindAt: input.reminder.remindAt, note: input.reminder.note ?? null, expectedAmount: D(inv.total).greaterThan(inv.amountSettled) ? D(inv.total).minus(inv.amountSettled).toFixed(2) : null });
        }
      }

      if (input.idempotencyKey) await tx.idempotencyKey.create({ data: { key: `sale:${input.idempotencyKey}`, operation: "sale", resultId: String(invoice.id), userId: actor.userId } });
      const posted = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      await audit(tx, actor, "sale.post", "Invoice", invoice.id, `${number} ${customer.name} total ${total.toFixed(2)}${pay ? `, paid ${pay.amount.toFixed(2)}` : ""}${lines.some(l => l.priceSource === "OVERRIDE") ? " (price override)" : ""}`, null, { invoice: posted, lines, paymentId });
      return posted;
    });
  } catch (e) {
    // a concurrent retry with the same key lost the race: return the sale that won
    if (input.idempotencyKey && (!(e instanceof AppError) || e.code === "DUPLICATE")) {
      const done = await prisma.idempotencyKey.findUnique({ where: { key: `sale:${input.idempotencyKey}` } });
      if (done) return prisma.invoice.findUniqueOrThrow({ where: { id: Number(done.resultId) } });
    }
    throw e;
  }
}

function Decimal_min(a: ReturnType<typeof D>, b: ReturnType<typeof D>) {
  return a.lessThan(b) ? a : b;
}

export const cancelInput = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, "Give the reason for the cancellation").max(400),
  date: z.string().refine(isIsoDate).optional(),
});

/**
 * Cancel a posted invoice by reversal: the invoice keeps its numbers and lines, a credit entry reverses the debit,
 * payments applied to it become free credit again (then settle other open invoices), stock comes back.
 */
export async function cancelInvoice(actor: Actor, raw: z.input<typeof cancelInput>) {
  assertCan(actor, "invoices.cancel");
  const input = cancelInput.parse(raw);
  const date = input.date ?? todayIso();
  return inTx(async tx => {
    const inv0 = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv0) return notFound("Invoice");
    await lockCustomer(tx, inv0.customerId);
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { items: true, delivery: true, refund: true } });
    if (inv.status === "CANCELLED") fail(`${inv.number} is already cancelled`);
    if (inv.kind === "REFUND") fail("A refund cannot be cancelled; record a new payment instead");
    const returns = await tx.creditNote.count({ where: { invoiceId: inv.id, kind: "RETURN", status: "POSTED" } });
    if (returns) fail(`${inv.number} has product returns; cancel is not possible — use a credit adjustment instead`);
    if (inv.delivery && inv.delivery.status === "DELIVERED") fail(`${inv.number} was already delivered; record a return instead`);

    await reverseAllocations(tx, actor, { invoiceId: inv.id }, `Invoice ${inv.number} cancelled`);
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId, cancelReason: input.reason } });
    if (D(inv.total).greaterThan(0)) {
      await postLedger(tx, actor, { customerId: inv.customerId, txDate: date, type: "INVOICE_CANCELLATION", credit: inv.total, reference: inv.number, invoiceId: inv.id, description: `Cancelled ${inv.number}: ${input.reason}` });
    }
    for (const it of inv.items) {
      const back = D(it.quantity).minus(it.quantityReturned);
      if (back.greaterThan(0)) await moveStockTx(tx, actor, { productId: it.productId, type: "CANCEL_SALE", quantity: back, date, reference: inv.number, invoiceId: inv.id, allowNegative: true });
    }
    if (inv.delivery && !["DELIVERED", "CANCELLED"].includes(inv.delivery.status)) {
      await tx.delivery.update({ where: { id: inv.delivery.id }, data: { status: "CANCELLED" } });
      await tx.deliveryEvent.create({ data: { deliveryId: inv.delivery.id, fromStatus: inv.delivery.status, toStatus: "CANCELLED", note: `Invoice ${inv.number} cancelled`, userId: actor.userId } });
    }
    // freed payments settle other open invoices first; what is left is advance credit
    await autoAllocate(tx, actor, inv.customerId, date);
    await audit(tx, actor, "invoice.cancel", "Invoice", inv.id, `${inv.number} cancelled: ${input.reason}`, { status: inv.status, amountSettled: inv.amountSettled.toString() }, { status: "CANCELLED" });
    return tx.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  });
}

/** Derived display status: OVERDUE when open past the due date. */
export function displayStatus(inv: { status: string; dueDate: Date | null; total: unknown; amountSettled: unknown }, today = todayIso()) {
  if ((inv.status === "UNPAID" || inv.status === "PARTIALLY_PAID") && inv.dueDate && isoOf(inv.dueDate) < today) return "OVERDUE";
  return inv.status;
}
