import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { postSale } from "@/server/services/sales";
import { recordPayment } from "@/server/services/payments";
import { cancelReminder, createReminder, dueReminders, listReminders, logCall, reminderHistory } from "@/server/services/reminders";
import { localToUtc, utcToLocal } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { ALL_PERMISSIONS } from "@/lib/constants";
import { addStock, cash, makeActor, newCustomer, resetDb, water20 } from "./helpers";

let admin: Actor;
let productId: number;
let cashId: number;
const local = (minutesFromNow: number) => utcToLocal(new Date(Date.now() + minutesFromNow * 60_000));

beforeAll(async () => {
  await resetDb();
  admin = await makeActor();
  productId = (await water20()).id;
  cashId = (await cash()).id;
  await addStock(admin, productId, 500);
});

describe("payment reminders", () => {
  it("business-time conversion (Mogadishu is UTC+3)", () => {
    expect(localToUtc("2026-11-21T09:00", "Africa/Mogadishu").toISOString()).toBe("2026-11-21T06:00:00.000Z");
    expect(utcToLocal("2026-11-21T06:00:00.000Z", "Africa/Mogadishu")).toBe("2026-11-21T09:00");
  });

  it("a credit sale can carry a 'call me later' reminder; it is due only when its time comes", async () => {
    const c = await newCustomer(admin);
    const inv = await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 4 }], reminder: { remindAt: local(60), note: "Call after Dhuhr" } });
    const r = await prisma.paymentReminder.findFirstOrThrow({ where: { customerId: c.id } });
    expect(r.invoiceId).toBe(inv.id);
    expect(r.expectedAmount?.toString()).toBe("4");
    expect((await dueReminders()).some(x => x.id === r.id)).toBe(false);
    expect((await dueReminders(new Date(Date.now() + 61 * 60_000))).some(x => x.id === r.id)).toBe(true);
  });

  it("no reminder is created when the sale is fully paid", async () => {
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 2 }], payment: { amount: "2", methodId: cashId }, reminder: { remindAt: local(30) } });
    expect(await prisma.paymentReminder.count({ where: { customerId: c.id } })).toBe(0);
  });

  it("logging a call reschedules it; 'no answer' without a next time is refused", async () => {
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 3 }] });
    const r = await createReminder(admin, { customerId: c.id, remindAt: local(-5), note: "Said call him today" });
    expect((await dueReminders()).some(x => x.id === r.id)).toBe(true);
    await expect(logCall(admin, { reminderId: r.id, outcome: "NO_ANSWER" })).rejects.toThrow(/call again/);
    await logCall(admin, { reminderId: r.id, outcome: "PROMISED", note: "Will pay Saturday", nextAt: local(24 * 60) });
    const after = await prisma.paymentReminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("OPEN");
    expect(after.callCount).toBe(1);
    expect((await dueReminders()).some(x => x.id === r.id)).toBe(false);
    expect(await prisma.reminderEvent.count({ where: { reminderId: r.id } })).toBe(2);
  });

  it("closes automatically when the customer pays the balance (not on a partial payment)", async () => {
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 5 }], reminder: { remindAt: local(-1) } });
    await recordPayment(admin, { customerId: c.id, amount: "2", methodId: cashId });
    expect((await prisma.paymentReminder.findFirstOrThrow({ where: { customerId: c.id } })).status).toBe("OPEN");
    await recordPayment(admin, { customerId: c.id, amount: "3", methodId: cashId });
    const r = await prisma.paymentReminder.findFirstOrThrow({ where: { customerId: c.id } });
    expect(r.status).toBe("DONE");
    expect(r.outcome).toMatch(/settled/);
  });

  it("history shows each step newest first, with who did it", async () => {
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 2 }] });
    const r = await createReminder(admin, { customerId: c.id, remindAt: local(-5), note: "First note" });
    await logCall(admin, { reminderId: r.id, outcome: "NO_ANSWER", nextAt: local(60) });
    await logCall(admin, { reminderId: r.id, outcome: "OTHER", note: "Wrong number", close: true });
    const h = await reminderHistory(r.id);
    expect(h.map(e => e.action)).toEqual(["DONE", "RESCHEDULED", "CREATED"]);
    expect(h[1].outcomeText).toBe("No answer / phone off");
    expect(h[1].nextAt).not.toBeNull();
    expect(h[0].note).toBe("Wrong number");
    expect(h.every(e => e.user !== null)).toBe(true);
  });

  it("cancel, lists, permissions", async () => {
    const c = await newCustomer(admin);
    await postSale(admin, { customerId: c.id, items: [{ productId, quantity: 1 }] });
    const r = await createReminder(admin, { customerId: c.id, remindAt: local(120) });
    expect((await listReminders({ view: "upcoming" })).rows.some(x => x.id === r.id)).toBe(true);
    await cancelReminder(admin, r.id, "Customer moved away");
    expect((await listReminders({ view: "closed" })).rows.some(x => x.id === r.id)).toBe(true);
    const viewer = await makeActor(ALL_PERMISSIONS.filter(p => p !== "reminders.manage"));
    await expect(createReminder(viewer, { customerId: c.id, remindAt: local(10) })).rejects.toThrow(/reminders.manage/);
  });
});
