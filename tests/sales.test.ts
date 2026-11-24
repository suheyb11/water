import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { postSale } from "@/server/services/sales";
import { recordPayment } from "@/server/services/payments";
import { createProduct } from "@/server/services/products";
import { recordStockMovement } from "@/server/services/inventory";
import { reconcile } from "@/server/services/reconciliation";
import { addDays, todayIso } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { ALL_PERMISSIONS } from "@/lib/constants";
import { addStock, balanceOf, cash, makeActor, newCustomer, resetDb, water20 } from "./helpers";

let admin: Actor;
let w20: number;
let w5: number;
let cashId: number;

beforeAll(async () => {
  await resetDb();
  admin = await makeActor();
  w20 = (await water20()).id;
  cashId = (await cash()).id;
  w5 = (await createProduct(admin, { code: "W5", name: "Water 5L", capacity: "5", capacityUnit: "L", saleUnit: "bottle", defaultPrice: "0.40", costPrice: "0.10", openingStock: "100" })).id;
  await addStock(admin, w20, 1000);
});

describe("sales", () => {
  it("cash sale: fully paid at the counter", async () => {
    const c = await newCustomer(admin);
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 3 }], payment: { amount: "3", methodId: cashId } });
    expect(inv.status).toBe("PAID");
    expect(inv.paidAtSale.toString()).toBe("3");
    expect(await balanceOf(c.id)).toBe("0.00");
    expect(await prisma.payment.count({ where: { customerId: c.id, receivedAtSale: true } })).toBe(1);
  });

  it("credit sale and partial payment", async () => {
    const c = await newCustomer(admin);
    const credit = await postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 4 }] });
    expect(credit.status).toBe("UNPAID");
    const partial = await postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 10 }], payment: { amount: "6", methodId: cashId } });
    expect(partial.status).toBe("PARTIALLY_PAID");
    expect(await balanceOf(c.id)).toBe("8.00");
  });

  it("several products, discount and extra charge: line totals and invoice total", async () => {
    const c = await newCustomer(admin);
    const inv = await postSale(admin, {
      customerId: c.id, items: [{ productId: w20, quantity: 3 }, { productId: w5, quantity: 5 }],
      discount: "0.50", charges: "1.00", chargesNote: "Third floor",
    });
    // 3 × 1.00 + 5 × 0.40 = 5.00; − 0.50 + 1.00 = 5.50
    expect(inv.subtotal.toString()).toBe("5");
    expect(inv.total.toString()).toBe("5.5");
    expect(inv.totalQuantity.toString()).toBe("8");
    const items = await prisma.invoiceItem.findMany({ where: { invoiceId: inv.id }, orderBy: { lineNo: "asc" } });
    expect(items.map(i => i.lineTotal.toString())).toEqual(["3", "2"]);
    expect(await balanceOf(c.id)).toBe("5.50");
  });

  it("discount needs the permission and cannot exceed the subtotal", async () => {
    const c = await newCustomer(admin);
    const clerk = await makeActor(ALL_PERMISSIONS.filter(p => p !== "sales.discount"));
    await expect(postSale(clerk, { customerId: c.id, items: [{ productId: w20, quantity: 1 }], discount: "0.1" })).rejects.toThrow(/sales.discount/);
    await expect(postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 1 }], discount: "2" })).rejects.toThrow(/bigger/);
  });

  it("overpayment at the counter settles older debt first, then becomes advance", async () => {
    const c = await newCustomer(admin);
    const old = await postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 2 }] });
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 3 }], payment: { amount: "10", methodId: cashId } });
    expect(inv.status).toBe("PAID");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("PAID");
    expect(await balanceOf(c.id)).toBe("-5.00");
    const p = await prisma.payment.findFirstOrThrow({ where: { saleInvoiceId: inv.id } });
    expect(p.advanceAtReceipt.toString()).toBe("5");
  });

  it("unique invoice numbers, idempotent retries", async () => {
    const c = await newCustomer(admin);
    const key = `test-${Date.now()}-abc`;
    const [a, b] = await Promise.all([
      postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 1 }], idempotencyKey: key }),
      postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 1 }], idempotencyKey: key }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.invoice.count({ where: { customerId: c.id } })).toBe(1);
    const numbers = (await prisma.invoice.findMany({ select: { number: true } })).map(i => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("concurrent postings for one customer keep a correct running balance", async () => {
    const c = await newCustomer(admin);
    await Promise.all([
      ...Array.from({ length: 5 }, () => postSale(admin, { customerId: c.id, items: [{ productId: w20, quantity: 2 }] })),
      ...Array.from({ length: 5 }, () => recordPayment(admin, { customerId: c.id, amount: "1", methodId: cashId })),
    ]);
    expect(await balanceOf(c.id)).toBe("5.00");
    const entries = await prisma.ledgerEntry.findMany({ where: { customerId: c.id }, orderBy: { seq: "asc" } });
    expect(entries.map(e => e.seq)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(entries.at(-1)!.balanceAfter.toString()).toBe("5");
  });

  it("idempotent payment: the same key is processed once", async () => {
    const c = await newCustomer(admin);
    const key = `pay-${Date.now()}-xyz`;
    const [p1, p2] = await Promise.all([
      recordPayment(admin, { customerId: c.id, amount: "7", methodId: cashId, idempotencyKey: key }),
      recordPayment(admin, { customerId: c.id, amount: "7", methodId: cashId, idempotencyKey: key }),
    ]);
    expect(p1.id).toBe(p2.id);
    expect(await balanceOf(c.id)).toBe("-7.00");
  });

  it("stock: sale reduces stock; negative stock is refused without permission", async () => {
    const c = await newCustomer(admin);
    const before = Number((await prisma.inventory.findUniqueOrThrow({ where: { productId: w5 } })).onHand);
    await postSale(admin, { customerId: c.id, items: [{ productId: w5, quantity: 10 }] });
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId: w5 } })).onHand)).toBe(before - 10);
    const clerk = await makeActor(ALL_PERMISSIONS.filter(p => p !== "inventory.negative"));
    await expect(postSale(clerk, { customerId: c.id, items: [{ productId: w5, quantity: 100000 }] })).rejects.toThrow(/Not enough stock/);
    // nothing was saved by the failed sale (rolled back)
    expect(await prisma.invoice.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("stock: additions, damage and adjustments", async () => {
    const s0 = Number((await prisma.inventory.findUniqueOrThrow({ where: { productId: w5 } })).onHand);
    await recordStockMovement(admin, { productId: w5, type: "PRODUCTION", quantity: 50 });
    await recordStockMovement(admin, { productId: w5, type: "DAMAGE", quantity: 2, notes: "Broken" });
    await recordStockMovement(admin, { productId: w5, type: "ADJUSTMENT_OUT", quantity: 1 });
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId: w5 } })).onHand)).toBe(s0 + 47);
  });

  it("dates: no future sales; past dates need sales.backdate", async () => {
    const c = await newCustomer(admin);
    await expect(postSale(admin, { customerId: c.id, saleDate: addDays(todayIso(), 1), items: [{ productId: w20, quantity: 1 }] })).rejects.toThrow(/future/);
    const clerk = await makeActor(ALL_PERMISSIONS.filter(p => p !== "sales.backdate"));
    await expect(postSale(clerk, { customerId: c.id, saleDate: addDays(todayIso(), -3), items: [{ productId: w20, quantity: 1 }] })).rejects.toThrow(/past date/);
    const back = await postSale(admin, { customerId: c.id, saleDate: addDays(todayIso(), -3), items: [{ productId: w20, quantity: 1 }] });
    expect(back.invoiceDate.toISOString().slice(0, 10)).toBe(addDays(todayIso(), -3));
  });

  it("sales staff without payment permission cannot take money", async () => {
    const c = await newCustomer(admin);
    const seller = await makeActor(["sales.create"]);
    await expect(postSale(seller, { customerId: c.id, items: [{ productId: w20, quantity: 1 }], payment: { amount: "1", methodId: cashId } })).rejects.toThrow(/payments.create/);
  });

  it("reconciles", async () => {
    const r = await reconcile();
    expect(r.findings.filter(f => f.severity === "error")).toEqual([]);
  });
});
