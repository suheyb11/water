import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createCustomer, listCustomers, updateCustomer, saveAddress } from "@/server/services/customers";
import { saveLocation } from "@/server/services/locations";
import { postSale } from "@/server/services/sales";
import { recordPayment } from "@/server/services/payments";
import { createRefund } from "@/server/services/adjustments";
import { recordExpense } from "@/server/services/expenses";
import { agingReport, customerStatement, periodStatement, profitAndLoss, dashboard } from "@/server/services/reports";
import { createDelivery, updateDeliveryStatus } from "@/server/services/deliveries";
import { reconcile } from "@/server/services/reconciliation";
import { addDays, todayIso } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { addStock, balanceOf, cash, makeActor, newCustomer, resetDb, water20 } from "./helpers";

let admin: Actor;
let productId: number;
let cashId: number;
const today = todayIso();

beforeAll(async () => {
  await resetDb();
  admin = await makeActor();
  productId = (await water20()).id;
  cashId = (await cash()).id;
  await addStock(admin, productId, 2000);
});

describe("customers and local addresses", () => {
  it("registers a customer with a local address, special price and opening balance in one step", async () => {
    const district = await saveLocation(admin, { kind: "DISTRICT", name: "Hodan" });
    const hood = await saveLocation(admin, { kind: "NEIGHBORHOOD", name: "Taleex", parentId: district.id });
    const place = await saveLocation(admin, { kind: "PLACE", name: "Isgoyska Dabka", alsoKnownAs: "Dabka junction", parentId: hood.id });
    const c = await createCustomer(admin, {
      name: "Faadumo Cali", phone: "+252615550001", customerType: "RESIDENTIAL",
      address: { localName: "Guriga buluuga ah ee ka soo horjeeda masjidka", districtId: district.id, neighborhoodId: hood.id, placeId: place.id, deliveryInstructions: "Call before arriving", latitude: "2.0469", longitude: "45.3182" },
      prices: [{ productId, price: "0.85" }],
      openingBalance: "12.50",
    });
    expect(c.code).toMatch(/^CUS-\d{6}$/);
    expect(await balanceOf(c.id)).toBe("12.50");
    const opening = await prisma.invoice.findFirstOrThrow({ where: { customerId: c.id, kind: "OPENING_BALANCE" } });
    expect(opening.total.toString()).toBe("12.5");
    for (const q of ["Faadumo", "5550001", c.code, "masjidka", "Taleex", "Hodan", "Dabka junction"]) {
      const r = await listCustomers({ q });
      expect(r.rows.map(x => x.id), `search "${q}"`).toContain(c.id);
    }
  });

  it("negative opening balance = customer credit", async () => {
    const c = await newCustomer(admin, { openingBalance: "-4" });
    expect(await balanceOf(c.id)).toBe("-4.00");
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 3 }] });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    expect(await balanceOf(c.id)).toBe("-1.00");
  });

  it("several customers can share a place, each with their own address record", async () => {
    const place = await prisma.location.findFirstOrThrow({ where: { name: "Isgoyska Dabka" } });
    const a = await newCustomer(admin, { address: { localName: "Shop next to the pharmacy", placeId: place.id } });
    const b = await newCustomer(admin, { address: { localName: "Upstairs flat, green door", placeId: place.id } });
    const addrs = await prisma.customerAddress.findMany({ where: { customerId: { in: [a.id, b.id] } } });
    expect(addrs).toHaveLength(2);
    expect(new Set(addrs.map(x => x.id)).size).toBe(2);
  });

  it("rejects duplicate phone numbers, updates details, adds addresses", async () => {
    const c = await newCustomer(admin, { phone: "+252617770000" });
    await expect(newCustomer(admin, { phone: "+252617770000" })).rejects.toThrow(/already used/);
    const u = await updateCustomer(admin, c.id, { name: "Renamed Customer", phone: "+252617770000", status: "ACTIVE", customerType: "BUSINESS" });
    expect(u.name).toBe("Renamed Customer");
    await saveAddress(admin, c.id, { localName: "Second shop at Bakaaraha", isPrimary: true });
    const primary = await prisma.customerAddress.findMany({ where: { customerId: c.id, isPrimary: true } });
    expect(primary).toHaveLength(1);
    expect(primary[0].localName).toBe("Second shop at Bakaaraha");
  });
});

describe("statements and reports", () => {
  it("daily statement separates sales, collections, receivables, advances, expenses and cash", async () => {
    const before = await periodStatement(today, today);
    const a = await newCustomer(admin);
    const b = await newCustomer(admin);
    await postSale(admin, { customerId: a.id, items: [{ productId, quantity: 10 }], payment: { amount: "10", methodId: cashId } }); // cash 10
    await postSale(admin, { customerId: b.id, items: [{ productId, quantity: 6 }], payment: { amount: "2", methodId: cashId } });  // 2 cash, 4 credit
    await recordPayment(admin, { customerId: a.id, amount: "5", methodId: cashId }); // advance 5
    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { name: "Fuel" } });
    await recordExpense(admin, { categoryId: cat.id, description: "Truck fuel", amount: "3", methodId: cashId });
    await createRefund(admin, { customerId: a.id, amount: "1", methodId: cashId, reason: "Change returned" });

    const s = (await periodStatement(today, today)).summary;
    const d = (k: keyof typeof s) => Number(s[k]) - Number(before.summary[k]);
    expect(d("totalSales")).toBeCloseTo(16, 2);
    expect(d("cashSales")).toBeCloseTo(12, 2);
    expect(d("creditSales")).toBeCloseTo(4, 2);
    expect(d("collections")).toBeCloseTo(17, 2); // 10 + 2 + 5 — the sale is not counted twice
    expect(d("advanceReceived")).toBeCloseTo(5, 2);
    expect(d("expenses")).toBeCloseTo(3, 2);
    expect(d("refunds")).toBeCloseTo(1, 2);
    expect(d("netCash")).toBeCloseTo(13, 2); // 17 − 3 − 1
    expect(d("quantity")).toBeCloseTo(16, 3);
    expect(d("invoiceCount")).toBe(2);
  });

  it("customer statement: opening balance, period rows, closing — from the ledger", async () => {
    const c = await newCustomer(admin, { registeredOn: addDays(today, -10), openingBalance: "3" });
    await postSale(admin, { customerId: c.id, saleDate: addDays(today, -5), items: [{ productId, quantity: 2 }] });
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 4 }] });
    await recordPayment(admin, { customerId: c.id, amount: "6", methodId: cashId });
    const st = (await customerStatement(c.id, addDays(today, -2), today))!;
    expect(st.opening).toBe("5.00"); // 3 opening + 2 sale before the period
    expect(st.totalDebit).toBe("4.00");
    expect(st.totalCredit).toBe("6.00");
    expect(st.closing).toBe("3.00");
    expect(st.rows.map(r => r.balance)).toEqual(["9.00", "3.00"]);
  });

  it("aging and profit & loss", async () => {
    await prisma.product.update({ where: { id: productId }, data: { costPrice: "0.35" } }); // cost is frozen on each new line
    const c = await newCustomer(admin, { registeredOn: addDays(today, -70) });
    await postSale(admin, { customerId: c.id, saleDate: addDays(today, -70), dueDate: addDays(today, -40), items: [{ productId, quantity: 7 }] });
    const ag = await agingReport(today);
    const row = ag.rows.find(r => r.customerId === c.id)!;
    expect(row.b["31-60"]).toBe("7.00");
    const pl = await profitAndLoss(addDays(today, -100), today);
    expect(Number(pl.netRevenue)).toBeGreaterThan(0);
    expect(Number(pl.cogs)).toBeCloseTo(7 * 0.35, 2); // only the sale made after the cost was set carries a cost
    expect(Number(pl.netProfit)).toBeCloseTo(Number(pl.grossProfit) - Number(pl.expenseTotal), 2);
  });

  it("dashboard figures come from the database", async () => {
    const d = await dashboard();
    expect(d.customers).toBeGreaterThan(5);
    expect(Number(d.todaySales)).toBeGreaterThan(0);
    expect(d.trend).toHaveLength(30);
  });
});

describe("deliveries", () => {
  it("a delivery created with a sale never creates a second sale", async () => {
    const c = await newCustomer(admin);
    const staff = await makeActor(["deliveries.update", "customers.view"]);
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 5 }], delivery: { assignedToId: staff.userId } });
    const d = await prisma.delivery.findFirstOrThrow({ where: { invoiceId: inv.id } });
    expect(d.status).toBe("ASSIGNED");
    await updateDeliveryStatus(staff, { deliveryId: d.id, status: "OUT_FOR_DELIVERY" });
    await updateDeliveryStatus(staff, { deliveryId: d.id, status: "DELIVERED", receivedBy: "Customer's son" });
    expect(await prisma.invoice.count({ where: { customerId: c.id } })).toBe(1);
    const other = await makeActor(["deliveries.update"]);
    await expect(updateDeliveryStatus(other, { deliveryId: d.id, status: "FAILED", failureReason: "x" })).rejects.toThrow(/not assigned/);
  });

  it("a delivery order is invoiced exactly once when delivered (cash on delivery)", async () => {
    const c = await newCustomer(admin, { prices: [{ productId, price: "0.90" }] });
    const staff = await makeActor(["deliveries.update"]);
    const stock0 = Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand);
    const d = await createDelivery(admin, { customerId: c.id, assignedToId: staff.userId, items: [{ productId, quantity: "10" }] });
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand)).toBe(stock0); // no stock move yet
    await updateDeliveryStatus(staff, { deliveryId: d.id, status: "OUT_FOR_DELIVERY" });
    await updateDeliveryStatus(staff, { deliveryId: d.id, status: "DELIVERED", payment: { amount: "9", methodId: cashId } });
    await expect(updateDeliveryStatus(staff, { deliveryId: d.id, status: "DELIVERED" })).rejects.toThrow();
    const invs = await prisma.invoice.findMany({ where: { customerId: c.id } });
    expect(invs).toHaveLength(1);
    expect(invs[0].total.toString()).toBe("9");
    expect(invs[0].status).toBe("PAID");
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand)).toBe(stock0 - 10);
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("DELIVERED");
  });

  it("everything reconciles", async () => {
    const r = await reconcile();
    expect(r.findings.filter(f => f.severity === "error")).toEqual([]);
  });
});

describe("database guards", () => {
  it("the database itself refuses to change or delete a posted ledger entry", async () => {
    const e = await prisma.ledgerEntry.findFirstOrThrow();
    await expect(prisma.ledgerEntry.update({ where: { id: e.id }, data: { debit: "999" } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(/cannot be changed/);
  });

  it("the database refuses an over-allocated payment", async () => {
    const p = await prisma.payment.findFirstOrThrow();
    await expect(prisma.payment.update({ where: { id: p.id }, data: { allocated: "100000" } })).rejects.toThrow();
  });
});

describe("daily statement: credit used at sale vs. later collection", () => {
  it("a same-day payment for a credit sale counts as debt collected, not as advance credit used", async () => {
    const before = (await periodStatement(today, today)).summary;
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 5 }] });          // credit sale 5
    await recordPayment(admin, { customerId: c.id, amount: "5", methodId: cashId });           // paid later the same day
    const adv = await newCustomer(admin);
    await recordPayment(admin, { customerId: adv.id, amount: "3", methodId: cashId });         // advance 3
    await postSale(admin, { customerId: adv.id, items: [{ productId, quantity: 4 }] });        // 3 from credit, 1 on account
    const s = (await periodStatement(today, today)).summary;
    const d = (k: keyof typeof s) => Number(s[k]) - Number(before[k]);
    expect(d("creditUsedAtSale")).toBeCloseTo(3, 2);
    expect(d("creditSales")).toBeCloseTo(6, 2);     // 5 + 1
    expect(d("collectedForDebt")).toBeCloseTo(5, 2);
    expect(d("advanceReceived")).toBeCloseTo(3, 2);
  });
});
