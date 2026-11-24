// Dynamic pricing engine.
// Priority: 1. customer price (a temporary one wins while active) → 2. customer-group price → 3. default price.
// Prices have effective dates; rows are never edited in place, a change closes the old row and adds a new one,
// and every change is written to PriceChangeLog. Sales copy the resolved price onto the invoice line, so later
// price changes never touch posted invoices.
import { z } from "zod";
import { prisma, inTx, type Db, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { D, price as roundPrice, toDb, type Decimal } from "@/lib/money";
import { dbDate, isIsoDate, isoOf, todayIso } from "@/lib/dates";
import type { PriceSource } from "@/lib/constants";

export interface ResolvedPrice {
  productId: number;
  price: Decimal;
  source: Exclude<PriceSource, "OVERRIDE">;
  refId: number | null;
  defaultPrice: Decimal;
  effectiveTo: string | null;
}

const covering = (date: Date) => ({
  effectiveFrom: { lte: date },
  OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
});

export async function defaultPriceAt(db: Db, productId: number, date: Date): Promise<{ price: Decimal; refId: number | null }> {
  const row = await db.productPrice.findFirst({ where: { productId, ...covering(date) }, orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }] });
  if (row) return { price: D(row.price), refId: row.id };
  const p = await db.product.findUnique({ where: { id: productId }, select: { defaultPrice: true } });
  if (!p) notFound("Product");
  return { price: D(p!.defaultPrice), refId: null };
}

/** Resolve the price of one product for one customer (or a walk-in/new customer when customerId is null) on a date. */
export async function resolvePrice(db: Db, customerId: number | null, productId: number, dateIso = todayIso()): Promise<ResolvedPrice> {
  const date = dbDate(dateIso);
  const def = await defaultPriceAt(db, productId, date);
  if (customerId) {
    const rows = await db.customerProductPrice.findMany({
      where: { customerId, productId, isActive: true, ...covering(date) },
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    });
    const temp = rows.find(r => r.isTemporary);
    const perm = rows.find(r => !r.isTemporary);
    const hit = temp ?? perm;
    if (hit) return { productId, price: D(hit.price), source: hit.isTemporary ? "CUSTOMER_TEMP" : "CUSTOMER", refId: hit.id, defaultPrice: def.price, effectiveTo: hit.effectiveTo ? isoOf(hit.effectiveTo) : null };

    const c = await db.customer.findUnique({ where: { id: customerId }, select: { groupId: true } });
    if (c?.groupId) {
      const g = await db.groupProductPrice.findFirst({
        where: { groupId: c.groupId, productId, isActive: true, ...covering(date) },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      });
      if (g) return { productId, price: D(g.price), source: "GROUP", refId: g.id, defaultPrice: def.price, effectiveTo: g.effectiveTo ? isoOf(g.effectiveTo) : null };
    }
  }
  return { productId, price: def.price, source: "DEFAULT", refId: def.refId, defaultPrice: def.price, effectiveTo: null };
}

export async function resolvePrices(db: Db, customerId: number | null, productIds: number[], dateIso = todayIso()) {
  const out: Record<number, ResolvedPrice> = {};
  for (const id of productIds) out[id] = await resolvePrice(db, customerId, id, dateIso);
  return out;
}

// ───────── Changing prices ─────────

const priceValue = z.union([z.string(), z.number()])
  .transform(v => String(v).trim())
  .refine(s => /^\d+(\.\d{1,4})?$/.test(s), "Enter a price like 0.85 (zero or more, up to 4 decimals)")
  .transform(s => roundPrice(s));
const isoDate = z.string().refine(isIsoDate, "Invalid date");

export const customerPriceInput = z.object({
  customerId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  price: priceValue,
  effectiveFrom: isoDate.optional(),
  effectiveTo: isoDate.optional().nullable(),
  temporary: z.boolean().optional().default(false),
  reason: z.string().trim().max(300).optional().nullable(),
});
export type CustomerPriceInput = z.input<typeof customerPriceInput>;

async function currentCustomerPrice(db: Db, customerId: number, productId: number, date: Date) {
  return db.customerProductPrice.findFirst({
    where: { customerId, productId, isActive: true, isTemporary: false, ...covering(date) },
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
  });
}

/** Set (or change) a customer's price for a product, effective from a date. Works inside an outer transaction. */
export async function setCustomerPriceTx(tx: Tx, actor: Actor, raw: CustomerPriceInput, action: "SET" | "BULK" = "SET") {
  const input = customerPriceInput.parse(raw);
  const from = input.effectiveFrom ?? todayIso();
  const fromDate = dbDate(from);
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product) notFound("Product");
  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true } });
  if (!customer) notFound("Customer");

  if (input.temporary) {
    if (!input.effectiveTo) fail("A temporary price needs an end date", "VALIDATION", "effectiveTo");
    if (input.effectiveTo! <= from) fail("The end date must be after the start date", "VALIDATION", "effectiveTo");
    const old = await resolvePrice(tx, input.customerId, input.productId, from);
    const row = await tx.customerProductPrice.create({
      data: {
        customerId: input.customerId, productId: input.productId, price: toDb(input.price, 4), effectiveFrom: fromDate,
        effectiveTo: dbDate(input.effectiveTo!), isTemporary: true, reason: input.reason ?? null, createdById: actor.userId,
      },
    });
    await tx.priceChangeLog.create({
      data: {
        level: "CUSTOMER", productId: input.productId, customerId: input.customerId, oldPrice: toDb(old.price, 4), newPrice: toDb(input.price, 4),
        effectiveFrom: fromDate, effectiveTo: dbDate(input.effectiveTo!), action: "TEMPORARY", reason: input.reason ?? null, changedById: actor.userId,
      },
    });
    return row;
  }

  const current = await currentCustomerPrice(tx, input.customerId, input.productId, fromDate);
  if (current && D(current.price).equals(input.price) && !current.effectiveTo) return current; // nothing changes

  // close permanent rows that are open on `from`; retire permanent rows that would start later (future-dated)
  await tx.customerProductPrice.updateMany({
    where: { customerId: input.customerId, productId: input.productId, isActive: true, isTemporary: false, effectiveFrom: { lt: fromDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }] },
    data: { effectiveTo: fromDate, endedById: actor.userId, endedAt: new Date() },
  });
  await tx.customerProductPrice.updateMany({
    where: { customerId: input.customerId, productId: input.productId, isActive: true, isTemporary: false, effectiveFrom: { gte: fromDate } },
    data: { isActive: false, endedById: actor.userId, endedAt: new Date() },
  });
  const row = await tx.customerProductPrice.create({
    data: {
      customerId: input.customerId, productId: input.productId, price: toDb(input.price, 4), effectiveFrom: fromDate,
      effectiveTo: input.effectiveTo ? dbDate(input.effectiveTo) : null, isTemporary: false, reason: input.reason ?? null, createdById: actor.userId,
    },
  });
  await tx.priceChangeLog.create({
    data: {
      level: "CUSTOMER", productId: input.productId, customerId: input.customerId, oldPrice: current ? toDb(current.price, 4) : null,
      newPrice: toDb(input.price, 4), effectiveFrom: fromDate, effectiveTo: input.effectiveTo ? dbDate(input.effectiveTo) : null,
      action, reason: input.reason ?? null, changedById: actor.userId,
    },
  });
  return row;
}

export async function setCustomerPrice(actor: Actor, raw: CustomerPriceInput) {
  assertCan(actor, "pricing.manage");
  return inTx(async tx => {
    const row = await setCustomerPriceTx(tx, actor, raw);
    await audit(tx, actor, "price.customer.set", "Customer", row.customerId, `Price for product #${row.productId} set to ${row.price} from ${isoOf(row.effectiveFrom)}${row.isTemporary ? ` until ${isoOf(row.effectiveTo)} (temporary)` : ""}`, null, row);
    return row;
  });
}

/** Stop using a customer's special price (customer goes back to group/default price) from a date. */
export async function removeCustomerPrice(actor: Actor, priceId: number, fromIso = todayIso(), reason?: string) {
  assertCan(actor, "pricing.manage");
  return inTx(async tx => {
    const row = await tx.customerProductPrice.findUnique({ where: { id: priceId } });
    if (!row || !row.isActive) notFound("Price");
    const from = dbDate(fromIso);
    const startsLater = row!.effectiveFrom >= from;
    const updated = await tx.customerProductPrice.update({
      where: { id: priceId },
      data: startsLater ? { isActive: false, endedById: actor.userId, endedAt: new Date() } : { effectiveTo: from, endedById: actor.userId, endedAt: new Date() },
    });
    await tx.priceChangeLog.create({
      data: { level: "CUSTOMER", productId: row!.productId, customerId: row!.customerId, oldPrice: toDb(row!.price, 4), newPrice: null, effectiveFrom: from, action: "REMOVE", reason: reason ?? null, changedById: actor.userId },
    });
    await audit(tx, actor, "price.customer.remove", "Customer", row!.customerId, `Special price removed for product #${row!.productId} from ${fromIso}`, row, updated);
    return updated;
  });
}

export const bulkPriceInput = z.object({
  productId: z.coerce.number().int().positive(),
  customerIds: z.array(z.coerce.number().int().positive()).min(1, "Select at least one customer"),
  mode: z.enum(["SET", "INCREASE_AMOUNT", "INCREASE_PERCENT"]),
  value: z.coerce.number().refine(Number.isFinite, "Enter a number"),
  effectiveFrom: isoDate.optional(),
  reason: z.string().trim().max(300).optional().nullable(),
});

/**
 * Change many customers' prices at once: set one price, or raise/lower each customer's *current* price
 * (special price if they have one, otherwise the price they would pay today) by an amount or a percentage.
 */
export async function bulkUpdateCustomerPrices(actor: Actor, raw: z.input<typeof bulkPriceInput>) {
  assertCan(actor, "pricing.manage");
  const input = bulkPriceInput.parse(raw);
  const from = input.effectiveFrom ?? todayIso();
  return inTx(async tx => {
    const results: { customerId: number; oldPrice: string; newPrice: string }[] = [];
    for (const customerId of [...new Set(input.customerIds)]) {
      const cur = await resolvePrice(tx, customerId, input.productId, from);
      let next = D(input.value);
      if (input.mode === "INCREASE_AMOUNT") next = cur.price.plus(input.value);
      if (input.mode === "INCREASE_PERCENT") next = cur.price.mul(D(100).plus(input.value)).div(100);
      next = roundPrice(next);
      if (next.isNegative()) fail(`The new price for customer #${customerId} would be below zero`);
      await setCustomerPriceTx(tx, actor, { customerId, productId: input.productId, price: next.toFixed(4), effectiveFrom: from, reason: input.reason ?? `Bulk ${input.mode.toLowerCase()} ${input.value}` }, "BULK");
      results.push({ customerId, oldPrice: cur.price.toFixed(4), newPrice: next.toFixed(4) });
    }
    await audit(tx, actor, "price.customer.bulk", "Product", input.productId, `Bulk price change (${input.mode} ${input.value}) for ${results.length} customers from ${from}`, null, results);
    return results;
  });
}

export const defaultPriceInput = z.object({
  productId: z.coerce.number().int().positive(),
  price: priceValue,
  effectiveFrom: isoDate.optional(),
  reason: z.string().trim().max(300).optional().nullable(),
});

/** Change a product's default (list) price from a date. Customer and group prices are not touched. */
export async function setDefaultPriceTx(tx: Tx, actor: Actor, raw: z.input<typeof defaultPriceInput>) {
  const input = defaultPriceInput.parse(raw);
  const from = input.effectiveFrom ?? todayIso();
  const fromDate = dbDate(from);
  const old = await defaultPriceAt(tx, input.productId, fromDate);
  await tx.productPrice.updateMany({
    where: { productId: input.productId, effectiveFrom: { lt: fromDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }] },
    data: { effectiveTo: fromDate },
  });
  // replaced future-dated default prices never take effect: give them a zero-length range (kept as history)
  const later = await tx.productPrice.findMany({ where: { productId: input.productId, effectiveFrom: { gte: fromDate } } });
  for (const r of later) await tx.productPrice.update({ where: { id: r.id }, data: { effectiveTo: r.effectiveFrom } });
  const row = await tx.productPrice.create({ data: { productId: input.productId, price: toDb(input.price, 4), effectiveFrom: fromDate, reason: input.reason ?? null, createdById: actor.userId } });
  if (from <= todayIso()) await tx.product.update({ where: { id: input.productId }, data: { defaultPrice: toDb(input.price, 4) } });
  await tx.priceChangeLog.create({
    data: { level: "DEFAULT", productId: input.productId, oldPrice: toDb(old.price, 4), newPrice: toDb(input.price, 4), effectiveFrom: fromDate, action: "SET", reason: input.reason ?? null, changedById: actor.userId },
  });
  return row;
}

export async function setDefaultPrice(actor: Actor, raw: z.input<typeof defaultPriceInput>) {
  assertCan(actor, "products.manage");
  return inTx(async tx => {
    const row = await setDefaultPriceTx(tx, actor, raw);
    await audit(tx, actor, "price.default.set", "Product", row.productId, `Default price set to ${row.price} from ${isoOf(row.effectiveFrom)}`, null, row);
    return row;
  });
}

export const groupPriceInput = z.object({
  groupId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  price: priceValue.nullable(), // null = remove the group price
  effectiveFrom: isoDate.optional(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export async function setGroupPrice(actor: Actor, raw: z.input<typeof groupPriceInput>) {
  assertCan(actor, "pricing.manage");
  const input = groupPriceInput.parse(raw);
  const from = input.effectiveFrom ?? todayIso();
  const fromDate = dbDate(from);
  return inTx(async tx => {
    const cur = await tx.groupProductPrice.findFirst({ where: { groupId: input.groupId, productId: input.productId, isActive: true, ...covering(fromDate) }, orderBy: { effectiveFrom: "desc" } });
    await tx.groupProductPrice.updateMany({
      where: { groupId: input.groupId, productId: input.productId, isActive: true, effectiveFrom: { lt: fromDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }] },
      data: { effectiveTo: fromDate },
    });
    await tx.groupProductPrice.updateMany({ where: { groupId: input.groupId, productId: input.productId, isActive: true, effectiveFrom: { gte: fromDate } }, data: { isActive: false } });
    const row = input.price === null ? null : await tx.groupProductPrice.create({
      data: { groupId: input.groupId, productId: input.productId, price: toDb(input.price, 4), effectiveFrom: fromDate, createdById: actor.userId },
    });
    await tx.priceChangeLog.create({
      data: { level: "GROUP", productId: input.productId, groupId: input.groupId, oldPrice: cur ? toDb(cur.price, 4) : null, newPrice: input.price ? toDb(input.price, 4) : null, effectiveFrom: fromDate, action: input.price === null ? "REMOVE" : "SET", reason: input.reason ?? null, changedById: actor.userId },
    });
    await audit(tx, actor, "price.group.set", "CustomerGroup", input.groupId, `Group price for product #${input.productId} ${input.price === null ? "removed" : `set to ${input.price}`} from ${from}`);
    return row;
  });
}

// ───────── Reading ─────────

/** The pricing grid: every (filtered) customer × active product with the price that would be charged today. */
export async function priceMatrix(opts: { q?: string; groupId?: number; onlySpecial?: boolean; take?: number; skip?: number; date?: string }) {
  const date = opts.date ?? todayIso();
  const d = dbDate(date);
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const where = {
    status: "ACTIVE",
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" as const } }, { phone: { contains: opts.q, mode: "insensitive" as const } }, { code: { contains: opts.q, mode: "insensitive" as const } }] } : {}),
    ...(opts.onlySpecial ? { prices: { some: { isActive: true, ...covering(d) } } } : {}),
  };
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where, orderBy: { name: "asc" }, take: opts.take ?? 50, skip: opts.skip ?? 0,
      select: { id: true, code: true, name: true, phone: true, groupId: true, group: { select: { name: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  const ids = customers.map(c => c.id);
  const [custPrices, groupPrices, defaults] = await Promise.all([
    prisma.customerProductPrice.findMany({ where: { customerId: { in: ids }, isActive: true, ...covering(d) }, orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }] }),
    prisma.groupProductPrice.findMany({ where: { isActive: true, ...covering(d) }, orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }] }),
    Promise.all(products.map(p => defaultPriceAt(prisma, p.id, d).then(r => [p.id, r.price] as const))),
  ]);
  const def = new Map(defaults);
  const rows = customers.map(c => ({
    customer: c,
    prices: products.map(p => {
      const mine = custPrices.filter(x => x.customerId === c.id && x.productId === p.id);
      const hit = mine.find(x => x.isTemporary) ?? mine.find(x => !x.isTemporary);
      if (hit) return { productId: p.id, price: D(hit.price).toFixed(4), source: (hit.isTemporary ? "CUSTOMER_TEMP" : "CUSTOMER") as PriceSource, priceId: hit.id, effectiveTo: hit.effectiveTo ? isoOf(hit.effectiveTo) : null };
      const g = c.groupId ? groupPrices.find(x => x.groupId === c.groupId && x.productId === p.id) : undefined;
      if (g) return { productId: p.id, price: D(g.price).toFixed(4), source: "GROUP" as PriceSource, priceId: null, effectiveTo: null };
      return { productId: p.id, price: def.get(p.id)!.toFixed(4), source: "DEFAULT" as PriceSource, priceId: null, effectiveTo: null };
    }),
  }));
  return { date, products: products.map(p => ({ id: p.id, code: p.code, name: p.name, capacity: D(p.capacity).toString(), capacityUnit: p.capacityUnit, defaultPrice: def.get(p.id)!.toFixed(4) })), rows, total };
}

/** What one customer pays for every active product today, and why. */
export async function customerPriceList(customerId: number, date = todayIso()) {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const out = [];
  for (const p of products) {
    const r = await resolvePrice(prisma, customerId, p.id, date);
    out.push({
      productId: p.id, name: p.name, capacity: D(p.capacity).toString(), capacityUnit: p.capacityUnit, saleUnit: p.saleUnit,
      defaultPrice: r.defaultPrice.toFixed(4), price: r.price.toFixed(4), source: r.source as PriceSource,
      priceId: r.source === "CUSTOMER" || r.source === "CUSTOMER_TEMP" ? r.refId : null, effectiveTo: r.effectiveTo,
    });
  }
  return out;
}

export async function customerPriceHistory(customerId: number) {
  return prisma.priceChangeLog.findMany({ where: { customerId }, orderBy: { changedAt: "desc" }, take: 200 });
}
