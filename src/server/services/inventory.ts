import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan, can } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { D, qty, toDb, type Num } from "@/lib/money";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { MANUAL_STOCK_TYPES, STOCK_MOVE_TYPES, type StockMoveType } from "@/lib/constants";
import { getSettings } from "./settings";

export interface MoveInput {
  productId: number;
  type: StockMoveType;
  quantity: Num; // positive; the sign comes from the type
  date: string;
  reference: string;
  invoiceId?: number | null;
  creditNoteId?: number | null;
  notes?: string | null;
  unitCost?: Num | null;
  allowNegative?: boolean;
}

/** Record one stock movement. Locks the product's stock row; refuses to go below zero unless allowed. */
export async function moveStockTx(tx: Tx, actor: Actor, m: MoveInput) {
  const product = await tx.product.findUnique({ where: { id: m.productId } });
  if (!product) return notFound("Product");
  if (!product.trackStock) return null;
  const q = qty(m.quantity);
  if (!q.greaterThan(0)) fail("Quantity must be more than zero");
  const signed = STOCK_MOVE_TYPES[m.type].sign > 0 ? q : q.neg();

  await tx.inventory.upsert({ where: { productId: m.productId }, create: { productId: m.productId, onHand: "0" }, update: {} });
  const inv = await tx.inventory.update({ where: { productId: m.productId }, data: { lockVersion: { increment: 1 } } }); // row lock
  const after = qty(D(inv.onHand).plus(signed));
  if (after.isNegative() && !m.allowNegative) {
    fail(`Not enough stock of ${product.name}: ${D(inv.onHand).toString()} on hand, ${q.toString()} needed`, "STOCK");
  }
  await tx.inventory.update({ where: { productId: m.productId }, data: { onHand: toDb(after, 3) } });
  return tx.stockMovement.create({
    data: {
      productId: m.productId, moveDate: dbDate(m.date), type: m.type, quantity: toDb(signed, 3), balanceAfter: toDb(after, 3),
      unitCost: m.unitCost != null ? toDb(m.unitCost, 4) : null, reference: m.reference, invoiceId: m.invoiceId ?? null,
      creditNoteId: m.creditNoteId ?? null, notes: m.notes ?? null, createdById: actor.userId,
    },
  });
}

/** May this actor take stock below zero? (business setting or explicit permission) */
export async function negativeStockAllowed(tx: Tx, actor: Actor) {
  const s = await getSettings(tx);
  return s.allowNegativeStock || can(actor, "inventory.negative");
}

export const manualMoveInput = z.object({
  productId: z.coerce.number().int().positive(),
  type: z.enum(MANUAL_STOCK_TYPES as [StockMoveType, ...StockMoveType[]]),
  quantity: z.coerce.number().positive("Quantity must be more than zero"),
  date: z.string().refine(isIsoDate, "Invalid date").optional(),
  reference: z.string().trim().max(40).optional().nullable(),
  unitCost: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
  allowNegative: z.boolean().optional(),
});

export async function recordStockMovement(actor: Actor, raw: z.input<typeof manualMoveInput>) {
  assertCan(actor, "inventory.manage");
  const input = manualMoveInput.parse(raw);
  if (input.allowNegative) assertCan(actor, "inventory.negative");
  return inTx(async tx => {
    const ref = input.reference || `STK-${Date.now().toString(36).toUpperCase()}`;
    const row = await moveStockTx(tx, actor, {
      productId: input.productId, type: input.type, quantity: String(input.quantity), date: input.date ?? todayIso(), reference: ref,
      notes: input.notes, unitCost: input.unitCost != null ? String(input.unitCost) : null,
      allowNegative: input.allowNegative || (await getSettings(tx)).allowNegativeStock,
    });
    if (!row) return fail("This product does not track stock");
    await audit(tx, actor, "stock.move", "Product", input.productId, `${STOCK_MOVE_TYPES[input.type].label}: ${input.quantity} (${ref})`, null, row);
    return row;
  });
}

/** Stock report for a period: opening, ins and outs per type, closing — all computed from movements. */
export async function stockReport(from: string, to: string) {
  const products = await prisma.product.findMany({ where: { trackStock: true }, include: { stock: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const [before, during] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ["productId"], where: { moveDate: { lt: dbDate(from) } }, _sum: { quantity: true } }),
    prisma.stockMovement.groupBy({ by: ["productId", "type"], where: { moveDate: { gte: dbDate(from), lte: dbDate(to) } }, _sum: { quantity: true } }),
  ]);
  return products.map(p => {
    const opening = D(before.find(b => b.productId === p.id)?._sum.quantity ?? 0);
    const byType: Record<string, string> = {};
    let net = D(0);
    for (const r of during.filter(d => d.productId === p.id)) {
      byType[r.type] = D(r._sum.quantity ?? 0).toString();
      net = net.plus(D(r._sum.quantity ?? 0));
    }
    return {
      productId: p.id, code: p.code, name: p.name, saleUnit: p.saleUnit, reorderLevel: D(p.reorderLevel).toString(),
      opening: opening.toString(), byType, closing: opening.plus(net).toString(), onHandNow: D(p.stock?.onHand ?? 0).toString(),
    };
  });
}

export async function stockLevels() {
  const products = await prisma.product.findMany({ where: { trackStock: true, status: "ACTIVE" }, include: { stock: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return products.map(p => {
    const onHand = D(p.stock?.onHand ?? 0);
    return { id: p.id, code: p.code, name: p.name, saleUnit: p.saleUnit, onHand: onHand.toString(), reorderLevel: D(p.reorderLevel).toString(), low: onHand.lessThanOrEqualTo(D(p.reorderLevel)) };
  });
}
