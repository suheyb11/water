// Deliveries. A delivery either fulfils an invoice (created with the sale) or is an order that is invoiced when it
// is delivered. Delivery.invoiceId is unique, so a delivery can never produce a second sale, and stock moves only
// with the sale — never with the delivery.
import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan, can } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { D, qty as roundQty, toDb } from "@/lib/money";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { addressFull } from "@/lib/address";
import { DELIVERY_STATUSES, DELIVERY_TRANSITIONS, type DeliveryStatus } from "@/lib/constants";
import { postSale } from "./sales";

export interface DeliveryTxInput {
  customerId: number;
  addressId?: number | null;
  invoiceId?: number | null;
  scheduledDate: string;
  assignedToId?: number | null;
  notes?: string | null;
  items: { productId: number; quantity: string }[];
}

export async function createDeliveryTx(tx: Tx, actor: Actor, d: DeliveryTxInput) {
  if (!d.items.length) fail("A delivery needs at least one product");
  const address = d.addressId
    ? await tx.customerAddress.findFirst({ where: { id: d.addressId, customerId: d.customerId }, include: { district: true, neighborhood: true, place: true } })
    : await tx.customerAddress.findFirst({ where: { customerId: d.customerId, isActive: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], include: { district: true, neighborhood: true, place: true } });
  if (d.assignedToId) {
    const u = await tx.user.findUnique({ where: { id: d.assignedToId } });
    if (!u || !u.isActive) fail("The assigned employee is not an active user");
  }
  const number = await nextNumber(tx, "DLV", "DLV", Number(d.scheduledDate.slice(0, 4)));
  const status: DeliveryStatus = d.assignedToId ? "ASSIGNED" : "PENDING";
  const row = await tx.delivery.create({
    data: {
      number, customerId: d.customerId, addressId: address?.id ?? null, invoiceId: d.invoiceId ?? null, scheduledDate: dbDate(d.scheduledDate), status,
      assignedToId: d.assignedToId ?? null, notes: d.notes ?? null, addressText: address ? addressFull(address) : null, createdById: actor.userId,
      items: { create: d.items.map(i => ({ productId: i.productId, quantity: toDb(roundQty(i.quantity), 3) })) },
      events: { create: { toStatus: status, note: d.invoiceId ? "Created with the sale" : "Delivery order created", userId: actor.userId } },
    },
  });
  return row;
}

export const deliveryInput = z.object({
  customerId: z.coerce.number().int().positive("Select a customer"),
  addressId: z.coerce.number().int().positive().optional().nullable(),
  scheduledDate: z.string().refine(isIsoDate, "Invalid date").optional(),
  assignedToId: z.union([z.coerce.number().int().positive(), z.literal(""), z.null()]).optional().transform(v => (v ? Number(v) : null)),
  notes: z.string().trim().max(600).optional().nullable(),
  items: z.array(z.object({ productId: z.coerce.number().int().positive(), quantity: z.union([z.string(), z.number()]).transform(String).refine(v => D(v || "0").greaterThan(0), "Quantity must be more than zero") })).min(1, "Add at least one product"),
});

/** Delivery order without a sale yet (invoiced on delivery). */
export async function createDelivery(actor: Actor, raw: z.input<typeof deliveryInput>) {
  assertCan(actor, "deliveries.manage");
  const input = deliveryInput.parse(raw);
  return inTx(async tx => {
    const c = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!c) return notFound("Customer");
    const row = await createDeliveryTx(tx, actor, { ...input, scheduledDate: input.scheduledDate ?? todayIso() });
    await audit(tx, actor, "delivery.create", "Delivery", row.id, `${row.number} for ${c.name}`, null, row);
    return row;
  });
}

export const statusInput = z.object({
  deliveryId: z.coerce.number().int().positive(),
  status: z.enum(DELIVERY_STATUSES),
  note: z.string().trim().max(400).optional().nullable(),
  failureReason: z.string().trim().max(300).optional().nullable(),
  receivedBy: z.string().trim().max(120).optional().nullable(),
  assignedToId: z.union([z.coerce.number().int().positive(), z.literal(""), z.null()]).optional().transform(v => (v ? Number(v) : null)),
  /** For an order without an invoice: collect money on delivery. */
  payment: z.object({ amount: z.union([z.string(), z.number()]).optional().nullable(), methodId: z.coerce.number().int().positive().optional().nullable(), reference: z.string().optional().nullable() }).optional().nullable(),
});

export async function updateDeliveryStatus(actor: Actor, raw: z.input<typeof statusInput>) {
  const input = statusInput.parse(raw);
  const d = await prisma.delivery.findUnique({ where: { id: input.deliveryId }, include: { items: true } });
  if (!d) return notFound("Delivery");
  const manager = can(actor, "deliveries.manage");
  if (!manager) {
    assertCan(actor, "deliveries.update");
    if (d.assignedToId !== actor.userId) fail("This delivery is not assigned to you", "FORBIDDEN");
    if (["ASSIGNED", "PENDING", "CANCELLED"].includes(input.status) && input.status !== d.status) fail("Only a manager can re-assign or cancel deliveries", "FORBIDDEN");
  }
  const from = d.status as DeliveryStatus;
  if (input.status === "ASSIGNED" && !input.assignedToId && !d.assignedToId) fail("Choose who delivers", "VALIDATION", "assignedToId");
  if (from === input.status && input.status !== "ASSIGNED") fail(`The delivery is already ${from.replaceAll("_", " ").toLowerCase()}`);
  if (from !== input.status && !DELIVERY_TRANSITIONS[from].includes(input.status)) fail(`A delivery that is ${from.replaceAll("_", " ").toLowerCase()} cannot go to ${input.status.replaceAll("_", " ").toLowerCase()}`);
  if (input.status === "FAILED" && !input.failureReason) fail("Say why the delivery failed", "VALIDATION", "failureReason");

  // delivered without an invoice yet → post the sale now (one transaction with the status change)
  if (input.status === "DELIVERED" && !d.invoiceId) {
    const pay = input.payment && input.payment.amount && D(String(input.payment.amount)).greaterThan(0) ? input.payment : null;
    const invoice = await postSale(actor, {
      customerId: d.customerId, addressId: d.addressId, fromDeliveryId: d.id, items: d.items.map(i => ({ productId: i.productId, quantity: D(i.quantity).toString() })),
      payment: pay ? { amount: String(pay.amount), methodId: pay.methodId ?? null, reference: pay.reference ?? null } : null,
      notes: `Delivery ${d.number}`, idempotencyKey: `delivery-${d.id}`,
    }, { deliveredReceivedBy: input.receivedBy, deliveredNote: input.note });
    await prisma.auditLog.create({ data: { userId: actor.userId, action: "delivery.deliver", entity: "Delivery", entityId: String(d.id), summary: `${d.number} delivered and invoiced as ${invoice.number}` } });
    return prisma.delivery.findUniqueOrThrow({ where: { id: d.id } });
  }

  return inTx(async tx => {
    const cur = await tx.delivery.update({ where: { id: d.id }, data: { updatedAt: new Date() } }); // row lock
    if (cur.status !== d.status) fail("The delivery was changed by someone else; reload and try again", "CONFLICT");
    const after = await tx.delivery.update({
      where: { id: d.id },
      data: {
        status: input.status,
        ...(input.assignedToId !== null && input.assignedToId !== undefined && manager ? { assignedToId: input.assignedToId } : {}),
        ...(input.status === "PENDING" ? { assignedToId: null } : {}),
        ...(input.status === "FAILED" ? { failureReason: input.failureReason } : {}),
        ...(input.status === "DELIVERED" ? { deliveredAt: new Date(), receivedBy: input.receivedBy ?? null, confirmationNote: input.note ?? null } : {}),
      },
    });
    await tx.deliveryEvent.create({ data: { deliveryId: d.id, fromStatus: from, toStatus: input.status, note: input.note || input.failureReason || null, userId: actor.userId } });
    await audit(tx, actor, "delivery.status", "Delivery", d.id, `${d.number}: ${from} → ${input.status}`, { status: from }, { status: input.status });
    return after;
  });
}

export async function listDeliveries(opts: { status?: string; date?: string; from?: string; to?: string; assignedToId?: number; q?: string; take?: number; skip?: number }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.date ? { scheduledDate: dbDate(opts.date) } : opts.from && opts.to ? { scheduledDate: { gte: dbDate(opts.from), lte: dbDate(opts.to) } } : {}),
    ...(opts.assignedToId ? { assignedToId: opts.assignedToId } : {}),
    ...(opts.q ? { OR: [{ number: { contains: opts.q } }, { customer: { name: { contains: opts.q } } }, { customer: { phone: { contains: opts.q } } }, { addressText: { contains: opts.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.delivery.findMany({
      where, orderBy: [{ scheduledDate: "desc" }, { id: "desc" }], take: opts.take ?? 25, skip: opts.skip ?? 0,
      include: { customer: { select: { id: true, name: true, phone: true, code: true } }, assignedTo: { select: { id: true, fullName: true } }, invoice: { select: { id: true, number: true, total: true } }, items: { include: { product: { select: { name: true, saleUnit: true } } } } },
    }),
    prisma.delivery.count({ where }),
  ]);
  return { rows, total };
}

export async function getDelivery(id: number) {
  return prisma.delivery.findUnique({
    where: { id },
    include: {
      customer: true, address: { include: { district: true, neighborhood: true, place: true } }, assignedTo: { select: { id: true, fullName: true } },
      invoice: { select: { id: true, number: true, total: true, amountSettled: true, status: true } },
      items: { include: { product: true } }, events: { orderBy: { at: "asc" } },
    },
  });
}
