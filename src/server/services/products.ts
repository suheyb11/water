import { z } from "zod";
import { prisma, inTx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { D, price as roundPrice, qty as roundQty, toDb } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { PRODUCT_STATUSES } from "@/lib/constants";
import { defaultPriceAt, setDefaultPriceTx } from "./pricing";
import { moveStockTx } from "./inventory";
import { dbDate } from "@/lib/dates";

const dec = (label: string) => z.union([z.string(), z.number()]).transform(v => String(v).trim())
  .refine(v => /^\d+(\.\d+)?$/.test(v), `${label} must be a number, zero or more`);
const bool = z.union([z.boolean(), z.string()]).transform(v => v === true || v === "true" || v === "on");

export const productInput = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, "Letters, digits, - and _ only").transform(s => s.toUpperCase()),
  name: z.string().trim().min(2, "Name is required").max(120),
  description: z.string().trim().max(500).optional().nullable().transform(v => v || null),
  capacity: dec("Capacity").refine(v => D(v).greaterThan(0), "Capacity must be more than zero"),
  capacityUnit: z.string().trim().min(1).max(12),
  saleUnit: z.string().trim().min(1).max(30),
  defaultPrice: dec("Price"),
  costPrice: dec("Cost price").optional().default("0"),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
  trackStock: bool.default(true),
  reorderLevel: dec("Reorder level").optional().default("0"),
  sortOrder: z.coerce.number().int().default(0),
  openingStock: dec("Opening stock").optional().default("0"),
  priceReason: z.string().trim().max(300).optional().nullable(),
  priceEffectiveFrom: z.string().optional().nullable(),
});
export type ProductInput = z.input<typeof productInput>;

export async function createProduct(actor: Actor, raw: ProductInput) {
  assertCan(actor, "products.manage");
  const input = productInput.parse(raw);
  return inTx(async tx => {
    if (await tx.product.findUnique({ where: { code: input.code } })) fail("A product with this code already exists", "VALIDATION", "code");
    const today = todayIso();
    const product = await tx.product.create({
      data: {
        code: input.code, name: input.name, description: input.description, capacity: toDb(roundQty(input.capacity), 3), capacityUnit: input.capacityUnit,
        saleUnit: input.saleUnit, defaultPrice: toDb(roundPrice(input.defaultPrice), 4), costPrice: toDb(roundPrice(input.costPrice), 4), status: input.status,
        trackStock: input.trackStock, reorderLevel: toDb(roundQty(input.reorderLevel), 3), sortOrder: input.sortOrder,
        listPrices: { create: { price: toDb(roundPrice(input.defaultPrice), 4), effectiveFrom: dbDate(today), reason: "Initial price", createdById: actor.userId } },
      },
    });
    if (input.trackStock) {
      await tx.inventory.create({ data: { productId: product.id, onHand: "0" } });
      if (D(input.openingStock).greaterThan(0)) await moveStockTx(tx, actor, { productId: product.id, type: "OPENING", quantity: input.openingStock, date: today, reference: `OPEN-${product.code}` });
    }
    await tx.priceChangeLog.create({ data: { level: "DEFAULT", productId: product.id, newPrice: toDb(input.defaultPrice, 4), effectiveFrom: dbDate(today), action: "SET", reason: "Initial price", changedById: actor.userId } });
    await audit(tx, actor, "product.create", "Product", product.id, `${product.code} ${product.name}`, null, product);
    return product;
  });
}

/**
 * Edit a product. Name/capacity/unit changes only affect new sales: posted invoice lines carry their own copy.
 * A price change goes through the price history (effective date), it is never a silent overwrite.
 */
export async function updateProduct(actor: Actor, id: number, raw: ProductInput) {
  assertCan(actor, "products.manage");
  const input = productInput.parse(raw);
  return inTx(async tx => {
    const before = await tx.product.findUnique({ where: { id } });
    if (!before) return notFound("Product");
    if (input.code !== before.code && (await tx.product.findUnique({ where: { code: input.code } }))) fail("A product with this code already exists", "VALIDATION", "code");
    const from = input.priceEffectiveFrom || todayIso();
    const current = await defaultPriceAt(tx, id, dbDate(from));
    const after = await tx.product.update({
      where: { id },
      data: {
        code: input.code, name: input.name, description: input.description, capacity: toDb(roundQty(input.capacity), 3), capacityUnit: input.capacityUnit,
        saleUnit: input.saleUnit, costPrice: toDb(roundPrice(input.costPrice), 4), status: input.status, trackStock: input.trackStock,
        reorderLevel: toDb(roundQty(input.reorderLevel), 3), sortOrder: input.sortOrder,
      },
    });
    if (!current.price.equals(roundPrice(input.defaultPrice))) {
      await setDefaultPriceTx(tx, actor, { productId: id, price: input.defaultPrice, effectiveFrom: from, reason: input.priceReason ?? "Changed on product page" });
    }
    if (input.trackStock) await tx.inventory.upsert({ where: { productId: id }, create: { productId: id, onHand: "0" }, update: {} });
    await audit(tx, actor, "product.update", "Product", id, `${after.code} ${after.name}`, before, after);
    return tx.product.findUniqueOrThrow({ where: { id } });
  });
}

export async function listProducts(opts: { status?: string; q?: string } = {}) {
  return prisma.product.findMany({
    where: { ...(opts.status ? { status: opts.status } : {}), ...(opts.q ? { OR: [{ name: { contains: opts.q } }, { code: { contains: opts.q } }] } : {}) },
    include: { stock: true, _count: { select: { customerPrices: { where: { isActive: true } } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getProduct(id: number) {
  return prisma.product.findUnique({ where: { id }, include: { stock: true, listPrices: { orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }], take: 50 } } });
}
