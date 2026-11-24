// Payment follow-up: "call me later about the money". A reminder becomes due at remindAt and pops up for staff;
// each call is logged (no answer / promised / paid), a promise reschedules it, and it closes by itself when the
// customer's balance is settled (see closeSettledReminders, called from postLedger).
import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { D, money, toDb } from "@/lib/money";
import { LOCAL_DT, localToUtc } from "@/lib/dates";
import { REMINDER_OUTCOMES, type ReminderOutcome } from "@/lib/constants";
import { addressLine } from "@/lib/address";

const localDt = z.string().trim().refine(v => LOCAL_DT.test(v), "Choose the date and time");
const optMoney = z.union([z.string(), z.number(), z.null()]).optional()
  .transform(v => (v === "" || v === null || v === undefined ? null : money(String(v))))
  .refine(v => v === null || v.greaterThan(0), "Amount must be more than zero");

export const reminderInput = z.object({
  customerId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive().optional().nullable(),
  remindAt: localDt,
  expectedAmount: optMoney,
  note: z.string().trim().max(600).optional().nullable(),
  assignedToId: z.coerce.number().int().positive().optional().nullable(),
});
export type ReminderInput = z.input<typeof reminderInput>;

/** Create a reminder inside an existing transaction (used by postSale). */
export async function createReminderTx(tx: Tx, actor: Actor, raw: ReminderInput) {
  const input = reminderInput.parse(raw);
  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true } });
  if (!customer) return notFound("Customer");
  if (input.invoiceId) {
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId }, select: { customerId: true } });
    if (!inv || inv.customerId !== customer.id) fail("Invoice not found for this customer");
  }
  const remindAt = localToUtc(input.remindAt);
  const row = await tx.paymentReminder.create({
    data: {
      customerId: customer.id, invoiceId: input.invoiceId ?? null, remindAt, expectedAmount: input.expectedAmount ? toDb(input.expectedAmount) : null,
      note: input.note || null, assignedToId: input.assignedToId ?? null, createdById: actor.userId,
      events: { create: { action: "CREATED", note: input.note || null, nextAt: remindAt, userId: actor.userId } },
    },
  });
  await audit(tx, actor, "reminder.create", "Customer", customer.id, `Payment reminder for ${customer.name} at ${input.remindAt}${input.note ? `: ${input.note}` : ""}`, null, row);
  return row;
}

export async function createReminder(actor: Actor, raw: ReminderInput) {
  assertCan(actor, "reminders.manage");
  return inTx(tx => createReminderTx(tx, actor, raw));
}

export const callInput = z.object({
  reminderId: z.coerce.number().int().positive(),
  outcome: z.enum(Object.keys(REMINDER_OUTCOMES) as [ReminderOutcome, ...ReminderOutcome[]]),
  note: z.string().trim().max(600).optional().nullable(),
  /** next call time; required for "promised" / "no answer" unless the reminder is closed */
  nextAt: localDt.optional().nullable(),
  close: z.boolean().optional().default(false),
});

/** Log a call. A next time reschedules it; PAID or close=true closes it. */
export async function logCall(actor: Actor, raw: z.input<typeof callInput>) {
  assertCan(actor, "reminders.manage");
  const input = callInput.parse(raw);
  return inTx(async tx => {
    const r = await tx.paymentReminder.findUnique({ where: { id: input.reminderId }, include: { customer: { select: { name: true } } } });
    if (!r) return notFound("Reminder");
    if (r.status !== "OPEN") fail("This reminder is already closed");
    const closing = input.close || input.outcome === "PAID";
    if (!closing && !input.nextAt) fail("When should we call again?", "VALIDATION", "nextAt");
    const nextAt = !closing && input.nextAt ? localToUtc(input.nextAt) : null;
    const outcomeText = `${REMINDER_OUTCOMES[input.outcome]}${input.note ? `: ${input.note}` : ""}`;
    const after = await tx.paymentReminder.update({
      where: { id: r.id },
      data: {
        callCount: { increment: 1 }, lastCallAt: new Date(), outcome: outcomeText.slice(0, 400),
        ...(closing ? { status: "DONE", closedAt: new Date(), closedById: actor.userId } : { remindAt: nextAt! }),
      },
    });
    await tx.reminderEvent.create({ data: { reminderId: r.id, action: closing ? "DONE" : nextAt ? "RESCHEDULED" : "CALLED", outcome: input.outcome, note: input.note || null, nextAt, userId: actor.userId } });
    await audit(tx, actor, "reminder.call", "Customer", r.customerId, `Called ${r.customer.name}: ${outcomeText}${nextAt ? ` — next call ${input.nextAt}` : closing ? " — closed" : ""}`);
    return after;
  });
}

export async function cancelReminder(actor: Actor, id: number, note?: string | null) {
  assertCan(actor, "reminders.manage");
  return inTx(async tx => {
    const r = await tx.paymentReminder.findUnique({ where: { id } });
    if (!r) return notFound("Reminder");
    if (r.status !== "OPEN") fail("This reminder is already closed");
    const after = await tx.paymentReminder.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date(), closedById: actor.userId, outcome: note || "Cancelled" } });
    await tx.reminderEvent.create({ data: { reminderId: id, action: "CANCELLED", note: note || null, userId: actor.userId } });
    await audit(tx, actor, "reminder.cancel", "Customer", r.customerId, `Payment reminder cancelled${note ? `: ${note}` : ""}`);
    return after;
  });
}

/**
 * Called from postLedger after every credit posting: when the customer no longer owes anything, open reminders
 * are closed automatically (nobody needs to call about money that has been paid).
 */
export async function closeSettledReminders(tx: Tx, customerId: number, balanceAfter: ReturnType<typeof D>, userId: number) {
  if (balanceAfter.greaterThan(0)) return 0;
  const open = await tx.paymentReminder.findMany({ where: { customerId, status: "OPEN" }, select: { id: true } });
  if (!open.length) return 0;
  await tx.paymentReminder.updateMany({ where: { id: { in: open.map(o => o.id) } }, data: { status: "DONE", closedAt: new Date(), closedById: userId, outcome: "Balance settled — closed automatically" } });
  for (const o of open) await tx.reminderEvent.create({ data: { reminderId: o.id, action: "AUTO_DONE", note: "Balance settled", userId } });
  return open.length;
}

const include = {
  customer: { select: { id: true, code: true, name: true, phone: true, altPhone: true, balance: true, addresses: { where: { isPrimary: true, isActive: true }, take: 1, include: { district: true, neighborhood: true, place: true } } } },
  invoice: { select: { id: true, number: true, total: true, amountSettled: true } },
} as const;

function shape(r: Awaited<ReturnType<typeof prisma.paymentReminder.findMany<{ include: typeof include }>>>[number]) {
  return {
    id: r.id, remindAt: r.remindAt.toISOString(), note: r.note, status: r.status, callCount: r.callCount, lastCallAt: r.lastCallAt?.toISOString() ?? null,
    outcome: r.outcome, expectedAmount: r.expectedAmount ? D(r.expectedAmount).toFixed(2) : null, assignedToId: r.assignedToId,
    customer: { id: r.customer.id, code: r.customer.code, name: r.customer.name, phone: r.customer.phone, altPhone: r.customer.altPhone, balance: D(r.customer.balance).toFixed(2), address: addressLine(r.customer.addresses[0]) },
    invoice: r.invoice ? { id: r.invoice.id, number: r.invoice.number, outstanding: D(r.invoice.total).minus(r.invoice.amountSettled).toFixed(2) } : null,
  };
}
export type ReminderView = ReturnType<typeof shape>;

/** Reminders whose time has come (for the pop-up and the bell). */
export async function dueReminders(now = new Date()) {
  const rows = await prisma.paymentReminder.findMany({ where: { status: "OPEN", remindAt: { lte: now } }, include, orderBy: { remindAt: "asc" }, take: 100 });
  return rows.map(shape);
}

export async function listReminders(opts: { view?: "due" | "upcoming" | "closed" | "all"; customerId?: number; take?: number; skip?: number }) {
  const now = new Date();
  const where = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.view === "due" ? { status: "OPEN", remindAt: { lte: now } } : opts.view === "upcoming" ? { status: "OPEN", remindAt: { gt: now } } : opts.view === "closed" ? { status: { in: ["DONE", "CANCELLED"] } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.paymentReminder.findMany({ where, include, orderBy: opts.view === "closed" ? { closedAt: "desc" } : { remindAt: "asc" }, take: opts.take ?? 50, skip: opts.skip ?? 0 }),
    prisma.paymentReminder.count({ where }),
  ]);
  return { rows: rows.map(shape), total };
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Reminder created", CALLED: "Called", RESCHEDULED: "Called — next call set", DONE: "Closed",
  CANCELLED: "Cancelled", AUTO_DONE: "Closed automatically",
};

/** Every step of one reminder (created, each call, rescheduling, closing), newest first, with who did it. */
export async function reminderHistory(id: number) {
  const events = await prisma.reminderEvent.findMany({ where: { reminderId: id }, orderBy: [{ at: "desc" }, { id: "desc" }] });
  const userIds = [...new Set(events.map(e => e.userId).filter((u): u is number => u !== null))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
  const nameOf = new Map(users.map(u => [u.id, u.fullName]));
  return events.map(e => ({
    id: e.id, at: e.at.toISOString(), action: e.action, actionText: EVENT_LABELS[e.action] ?? e.action,
    outcome: e.outcome, outcomeText: e.outcome ? (REMINDER_OUTCOMES[e.outcome as ReminderOutcome] ?? e.outcome) : null,
    note: e.note, nextAt: e.nextAt?.toISOString() ?? null, user: e.userId ? (nameOf.get(e.userId) ?? null) : null,
  }));
}
export type ReminderHistoryItem = Awaited<ReturnType<typeof reminderHistory>>[number];
