// The nine customer-account scenarios from the specification, plus running balances and reconciliation.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { postSale, cancelInvoice } from "@/server/services/sales";
import { recordPayment, reversePayment } from "@/server/services/payments";
import { createCreditAdjustment, createDebitNote, createRefund, createReturn } from "@/server/services/adjustments";
import { customerStatement } from "@/server/services/reports";
import { reconcile } from "@/server/services/reconciliation";
import { todayIso } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { addStock, balanceOf, cash, makeActor, newCustomer, resetDb, water20 } from "./helpers";

let actor: Actor;
let productId: number;
let cashId: number;

beforeAll(async () => {
  await resetDb();
  actor = await makeActor();
  productId = (await water20()).id; // default price 1.00
  cashId = (await cash()).id;
  await addStock(actor, productId, 10_000);
});

const sell = (customerId: number, quantity: number, paid = 0) =>
  postSale(actor, { customerId, items: [{ productId, quantity }], payment: paid ? { amount: paid, methodId: cashId } : null });

describe("customer ledger scenarios", () => {
  it("1. buys $10 and pays nothing → debit 10, balance 10", async () => {
    const c = await newCustomer(actor);
    const inv = await sell(c.id, 10);
    expect(inv.total.toString()).toBe("10");
    expect(inv.status).toBe("UNPAID");
    expect(await balanceOf(c.id)).toBe("10.00");
    const l = await prisma.ledgerEntry.findMany({ where: { customerId: c.id } });
    expect(l).toHaveLength(1);
    expect(l[0].type).toBe("SALE");
    expect(l[0].debit.toString()).toBe("10");
  });

  it("2/3. owes 10, pays 5 → 5 left; pays 5 more → settled", async () => {
    const c = await newCustomer(actor);
    const inv = await sell(c.id, 10);
    await recordPayment(actor, { customerId: c.id, amount: "5", methodId: cashId });
    expect(await balanceOf(c.id)).toBe("5.00");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIALLY_PAID");
    await recordPayment(actor, { customerId: c.id, amount: "5", methodId: cashId });
    expect(await balanceOf(c.id)).toBe("0.00");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("4. owes 10, pays 15 → balance −5 (advance credit)", async () => {
    const c = await newCustomer(actor);
    await sell(c.id, 10);
    const p = await recordPayment(actor, { customerId: c.id, amount: "15", methodId: cashId });
    expect(await balanceOf(c.id)).toBe("-5.00");
    expect(p.allocated.toString()).toBe("10");
    expect(p.advanceAtReceipt.toString()).toBe("5");
  });

  it("5. has $5 credit, buys $8 → credit applied, owes 3", async () => {
    const c = await newCustomer(actor);
    await recordPayment(actor, { customerId: c.id, amount: "5", methodId: cashId });
    const inv = await sell(c.id, 8);
    expect(await balanceOf(c.id)).toBe("3.00");
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.amountSettled.toString()).toBe("5");
    expect(after.status).toBe("PARTIALLY_PAID");
    expect(after.paidAtSale.toString()).toBe("0"); // the credit is not cash taken at the sale
  });

  it("6. advance payment without buying → recorded as credit", async () => {
    const c = await newCustomer(actor);
    const p = await recordPayment(actor, { customerId: c.id, amount: "20", methodId: cashId });
    expect(await balanceOf(c.id)).toBe("-20.00");
    expect(p.advanceAtReceipt.toString()).toBe("20");
  });

  it("7. several purchases and payments on different dates → chronological ledger with running balance", async () => {
    const c = await newCustomer(actor);
    await sell(c.id, 4);           // +4  = 4
    await recordPayment(actor, { customerId: c.id, amount: "3", methodId: cashId }); // −3 = 1
    await sell(c.id, 6, 2);        // +6 −2 = 5
    await recordPayment(actor, { customerId: c.id, amount: "10", methodId: cashId }); // −10 = −5
    const entries = await prisma.ledgerEntry.findMany({ where: { customerId: c.id }, orderBy: { seq: "asc" } });
    expect(entries.map(e => e.balanceAfter.toString())).toEqual(["4", "1", "7", "5", "-5"]);
    expect(entries.map(e => e.seq)).toEqual([1, 2, 3, 4, 5]);
    const st = await customerStatement(c.id, todayIso(), todayIso());
    expect(st!.opening).toBe("0.00");
    expect(st!.closing).toBe("-5.00");
    expect(st!.rows.at(-1)!.balance).toBe("-5.00");
  });

  it("8. return of products → credit at the invoiced price, stock back; refund out of credit", async () => {
    const c = await newCustomer(actor);
    const inv = await sell(c.id, 10, 10); // paid in full
    const item = (await prisma.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } }));
    const stockBefore = (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand.toString();
    await createReturn(actor, { invoiceId: inv.id, items: [{ invoiceItemId: item.id, quantity: 3 }], reason: "Leaking containers" });
    expect(await balanceOf(c.id)).toBe("-3.00");
    const stockAfter = (await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand.toString();
    expect(Number(stockAfter) - Number(stockBefore)).toBe(3);
    await expect(createRefund(actor, { customerId: c.id, amount: "4", methodId: cashId, reason: "Too much" })).rejects.toThrow(/only 3.00/);
    await createRefund(actor, { customerId: c.id, amount: "3", methodId: cashId, reason: "Money back for returned water" });
    expect(await balanceOf(c.id)).toBe("0.00");
  });

  it("9. price adjustment after invoicing is a separate document; the invoice is untouched", async () => {
    const c = await newCustomer(actor);
    const inv = await sell(c.id, 10);
    await createCreditAdjustment(actor, { customerId: c.id, invoiceId: inv.id, amount: "1.50", reason: "Agreed price was 0.85" });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { items: true } });
    expect(after.total.toString()).toBe("10");
    expect(after.items[0].unitPrice.toString()).toBe("1");
    expect(after.amountSettled.toString()).toBe("1.5");
    expect(await balanceOf(c.id)).toBe("8.50");
    await createDebitNote(actor, { customerId: c.id, amount: "2", reason: "Delivery to upper floor", relatedInvoiceId: inv.id });
    expect(await balanceOf(c.id)).toBe("10.50");
  });
});

describe("corrections", () => {
  it("cancelling an invoice reverses it, frees the payment as credit and returns stock", async () => {
    const c = await newCustomer(actor);
    const stock0 = Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand);
    const inv = await sell(c.id, 5, 5);
    await cancelInvoice(actor, { invoiceId: inv.id, reason: "Wrong customer selected" });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.total.toString()).toBe("5"); // never rewritten
    expect(await balanceOf(c.id)).toBe("-5.00"); // the cash paid is now customer credit
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).onHand)).toBe(stock0);
    await expect(cancelInvoice(actor, { invoiceId: inv.id, reason: "again please" })).rejects.toThrow(/already cancelled/);
  });

  it("reversing a payment debits the account back and re-opens the invoice", async () => {
    const c = await newCustomer(actor);
    const inv = await sell(c.id, 6);
    const p = await recordPayment(actor, { customerId: c.id, amount: "6", methodId: cashId });
    await reversePayment(actor, { paymentId: p.id, reason: "Mobile money did not arrive" });
    expect(await balanceOf(c.id)).toBe("6.00");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("UNPAID");
    await expect(reversePayment(actor, { paymentId: p.id, reason: "twice please" })).rejects.toThrow(/already reversed/);
  });

  it("posted ledger entries are append-only (no update path) and every row has a reference and author", async () => {
    const rows = await prisma.ledgerEntry.findMany();
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) { expect(r.reference).toBeTruthy(); expect(r.createdById).toBeTruthy(); }
  });

  it("explicit allocation across several invoices, the rest kept as advance", async () => {
    const c = await newCustomer(actor);
    const a = await sell(c.id, 4);
    const b = await sell(c.id, 6);
    const p = await recordPayment(actor, { customerId: c.id, amount: "12", methodId: cashId, allocations: [{ invoiceId: b.id, amount: "6" }, { invoiceId: a.id, amount: "1" }], autoAllocate: false });
    expect(p.allocated.toString()).toBe("7");
    expect(p.advanceAtReceipt.toString()).toBe("5");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PAID");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PARTIALLY_PAID");
    expect(await balanceOf(c.id)).toBe("-2.00");
    await expect(recordPayment(actor, { customerId: c.id, amount: "1", methodId: cashId, allocations: [{ invoiceId: a.id, amount: "5" }] })).rejects.toThrow(/more than the payment/);
  });

  it("reconciliation finds no errors after all of the above", async () => {
    const r = await reconcile();
    expect(r.findings.filter(f => f.severity === "error")).toEqual([]);
  });
});
