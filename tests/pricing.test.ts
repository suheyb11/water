import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resolvePrice, setCustomerPrice, setDefaultPrice, setGroupPrice, bulkUpdateCustomerPrices, removeCustomerPrice, priceMatrix } from "@/server/services/pricing";
import { postSale } from "@/server/services/sales";
import { saveCustomerGroup } from "@/server/services/settings";
import { addDays, todayIso } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { ALL_PERMISSIONS } from "@/lib/constants";
import { addStock, makeActor, newCustomer, resetDb, water20 } from "./helpers";

let admin: Actor;
let productId: number;
const today = todayIso();

beforeAll(async () => {
  await resetDb();
  admin = await makeActor();
  productId = (await water20()).id;
  await addStock(admin, productId, 5000);
});

describe("pricing engine", () => {
  it("uses the default price for a customer without a special price", async () => {
    const c = await newCustomer(admin);
    const r = await resolvePrice(prisma, c.id, productId);
    expect(r.price.toFixed(2)).toBe("1.00");
    expect(r.source).toBe("DEFAULT");
  });

  it("customer A 0.80, B 0.90, C default 1.00 — each sale picks its own price", async () => {
    const a = await newCustomer(admin, { prices: [{ productId, price: "0.80" }] });
    const b = await newCustomer(admin, { prices: [{ productId, price: "0.90" }] });
    const c = await newCustomer(admin);
    const ia = await postSale(admin, { customerId: a.id, items: [{ productId, quantity: 10 }] });
    const ib = await postSale(admin, { customerId: b.id, items: [{ productId, quantity: 10 }] });
    const ic = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 10 }] });
    expect([ia.total.toString(), ib.total.toString(), ic.total.toString()]).toEqual(["8", "9", "10"]);
    const line = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: ia.id } });
    expect(line.priceSource).toBe("CUSTOMER");
    expect(line.unitPrice.toString()).toBe("0.8");
  });

  it("Ahmed: 5 × 0.85 = 4.25 on invoice, ledger, stock", async () => {
    const stock0 = Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand);
    const ahmed = await newCustomer(admin, { name: "Ahmed", prices: [{ productId, price: "0.85" }] });
    const inv = await postSale(admin, { customerId: ahmed.id, items: [{ productId, quantity: 5 }] });
    expect(inv.total.toString()).toBe("4.25");
    const ledger = await prisma.ledgerEntry.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(ledger.debit.toString()).toBe("4.25");
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand)).toBe(stock0 - 5);
  });

  it("historical invoices never change when the customer price changes", async () => {
    const a = await newCustomer(admin, { prices: [{ productId, price: "0.80" }] });
    const jan = await postSale(admin, { customerId: a.id, items: [{ productId, quantity: 10 }] });
    await setCustomerPrice(admin, { customerId: a.id, productId, price: "0.90" });
    const feb = await postSale(admin, { customerId: a.id, items: [{ productId, quantity: 10 }] });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: jan.id } })).total.toString()).toBe("8");
    expect(feb.total.toString()).toBe("9");
    // global price change does not touch either
    await setDefaultPrice(admin, { productId, price: "1.20" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: jan.id } })).total.toString()).toBe("8");
    expect((await resolvePrice(prisma, a.id, productId)).price.toFixed(2)).toBe("0.90");
    await setDefaultPrice(admin, { productId, price: "1.00" });
    const hist = await prisma.customerProductPrice.findMany({ where: { customerId: a.id, productId }, orderBy: { id: "asc" } });
    expect(hist).toHaveLength(2); // the old row is kept, not overwritten
    // changed on the day it started → superseded (inactive); otherwise it would be closed with an end date
    expect(hist[0].isActive === false || hist[0].effectiveTo !== null).toBe(true);
    expect(hist[0].price.toString()).toBe("0.8");
    const log = await prisma.priceChangeLog.findMany({ where: { customerId: a.id } });
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log.every(l => l.changedById === admin.userId)).toBe(true);
  });

  it("effective dates: a future price only applies from its date", async () => {
    const c = await newCustomer(admin);
    await setCustomerPrice(admin, { customerId: c.id, productId, price: "0.70", effectiveFrom: addDays(today, 10) });
    expect((await resolvePrice(prisma, c.id, productId, today)).price.toFixed(2)).toBe("1.00");
    expect((await resolvePrice(prisma, c.id, productId, addDays(today, 10))).price.toFixed(2)).toBe("0.70");
  });

  it("a price change closes the old row; a back-dated sale uses the price valid on its date", async () => {
    const c = await newCustomer(admin, { registeredOn: addDays(today, -30), prices: [{ productId, price: "0.80" }] });
    await setCustomerPrice(admin, { customerId: c.id, productId, price: "0.95", effectiveFrom: today });
    const old = await prisma.customerProductPrice.findFirstOrThrow({ where: { customerId: c.id, price: "0.8" } });
    expect(old.effectiveTo!.toISOString().slice(0, 10)).toBe(today);
    const back = await postSale(admin, { customerId: c.id, saleDate: addDays(today, -5), items: [{ productId, quantity: 10 }] });
    const now = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 10 }] });
    expect(back.total.toString()).toBe("8");
    expect(now.total.toString()).toBe("9.5");
  });

  it("a temporary price wins while active, then the permanent one returns", async () => {
    const c = await newCustomer(admin, { prices: [{ productId, price: "0.90" }] });
    await setCustomerPrice(admin, { customerId: c.id, productId, price: "0.75", temporary: true, effectiveFrom: today, effectiveTo: addDays(today, 7) });
    const now = await resolvePrice(prisma, c.id, productId, today);
    expect(now.price.toFixed(2)).toBe("0.75");
    expect(now.source).toBe("CUSTOMER_TEMP");
    expect((await resolvePrice(prisma, c.id, productId, addDays(today, 7))).price.toFixed(2)).toBe("0.90");
    await expect(setCustomerPrice(admin, { customerId: c.id, productId, price: "0.5", temporary: true })).rejects.toThrow(/end date/);
  });

  it("group price sits between customer price and default", async () => {
    const g = await saveCustomerGroup(admin, { code: "SHOPS", name: "Shops" });
    await setGroupPrice(admin, { groupId: g.id, productId, price: "0.95" });
    const inGroup = await newCustomer(admin, { groupId: g.id });
    const special = await newCustomer(admin, { groupId: g.id, prices: [{ productId, price: "0.88" }] });
    expect((await resolvePrice(prisma, inGroup.id, productId)).source).toBe("GROUP");
    expect((await resolvePrice(prisma, inGroup.id, productId)).price.toFixed(2)).toBe("0.95");
    expect((await resolvePrice(prisma, special.id, productId)).price.toFixed(2)).toBe("0.88");
  });

  it("removing a special price sends the customer back to the default", async () => {
    const c = await newCustomer(admin, { prices: [{ productId, price: "0.60" }] });
    const row = await prisma.customerProductPrice.findFirstOrThrow({ where: { customerId: c.id } });
    await removeCustomerPrice(admin, row.id);
    expect((await resolvePrice(prisma, c.id, productId)).price.toFixed(2)).toBe("1.00");
  });

  it("bulk update: +10% on several customers' current prices", async () => {
    const a = await newCustomer(admin, { prices: [{ productId, price: "0.80" }] });
    const b = await newCustomer(admin);
    const res = await bulkUpdateCustomerPrices(admin, { productId, customerIds: [a.id, b.id], mode: "INCREASE_PERCENT", value: 10 });
    expect(res.map(r => r.newPrice)).toEqual(["0.8800", "1.1000"]);
    const m = await priceMatrix({ q: a.name });
    expect(m.rows[0].prices[0].price).toBe("0.8800");
  });

  it("manual price override needs the permission and a reason, and is recorded on the line", async () => {
    const c = await newCustomer(admin);
    const clerk = await makeActor(ALL_PERMISSIONS.filter(p => p !== "sales.override_price"));
    await expect(postSale(clerk, { customerId: c.id, items: [{ productId, quantity: 1, unitPrice: "0.50" }] })).rejects.toThrow(/sales.override_price/);
    await expect(postSale(admin, { customerId: c.id, items: [{ productId, quantity: 1, unitPrice: "0.50" }] })).rejects.toThrow(/reason/);
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 2, unitPrice: "0.50", overrideReason: "Promotion" }] });
    const line = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(line.priceSource).toBe("OVERRIDE");
    expect(line.resolvedPrice.toString()).toBe("1");
    expect(line.unitPrice.toString()).toBe("0.5");
    expect(inv.total.toString()).toBe("1");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Invoice", entityId: String(inv.id) } });
    expect(log.summary).toMatch(/override/);
  });

  it("changing a product's capacity/name does not change posted invoice lines", async () => {
    const c = await newCustomer(admin);
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 1 }] });
    await prisma.product.update({ where: { id: productId }, data: { capacity: "19", name: "Water 19L" } });
    const line = await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(line.capacity.toString()).toBe("20");
    expect(line.productName).toBe("Purified Drinking Water");
    await prisma.product.update({ where: { id: productId }, data: { capacity: "20", name: "Purified Drinking Water" } });
  });
});
