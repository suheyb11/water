"use server";
// Read-only lookups for interactive screens (customer search, live price quote).
import { currentActor } from "@/server/auth/session";
import { can } from "@/server/actor";
import { prisma } from "@/server/db";
import { quickFindCustomers } from "@/server/services/customers";
import { quoteSale } from "@/server/services/sales";
import { unallocatedCredit } from "@/server/services/posting";
import { addressLine } from "@/lib/address";
import { D } from "@/lib/money";
import { isIsoDate, todayIso } from "@/lib/dates";

export async function searchCustomersAction(q: string) {
  const actor = await currentActor();
  if (!actor || !(can(actor, "customers.view") || can(actor, "sales.create") || can(actor, "payments.create"))) return [];
  const rows = await quickFindCustomers(q.slice(0, 80), 12);
  return rows.map(c => ({ id: c.id, code: c.code, name: c.name, phone: c.phone, balance: D(c.balance).toFixed(2), address: addressLine(c.addresses[0]) }));
}

export async function quoteAction(customerId: number | null, items: { productId: number; quantity: string; unitPrice?: string | null }[], date?: string) {
  const actor = await currentActor();
  if (!actor || !can(actor, "sales.create")) return null;
  const q = await quoteSale(customerId, items, date && isIsoDate(date) ? date : todayIso());
  let credit = "0.00";
  let balance = "0.00";
  let addresses: { id: number; text: string; isPrimary: boolean }[] = [];
  let creditLimit: string | null = null;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { addresses: { where: { isActive: true }, include: { district: true, neighborhood: true, place: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] } } });
    if (c) {
      balance = D(c.balance).toFixed(2);
      creditLimit = c.creditLimit ? D(c.creditLimit).toFixed(2) : null;
      credit = (await prisma.$transaction(tx => unallocatedCredit(tx, c.id))).toFixed(2);
      addresses = c.addresses.map(a => ({ id: a.id, text: addressLine(a), isPrimary: a.isPrimary }));
    }
  }
  return { ...q, credit, balance, creditLimit, addresses };
}

export async function openInvoicesAction(customerId: number) {
  const actor = await currentActor();
  if (!actor || !can(actor, "payments.create")) return [];
  const rows = await prisma.invoice.findMany({ where: { customerId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }] });
  return rows.map(i => ({ id: i.id, number: i.number, kind: i.kind, date: i.invoiceDate.toISOString().slice(0, 10), total: D(i.total).toFixed(2), outstanding: D(i.total).minus(i.amountSettled).toFixed(2) }));
}

/** Due payment reminders for the bell and the pop-up (polled every minute). */
export async function dueRemindersAction() {
  const actor = await currentActor();
  if (!actor || !can(actor, "reminders.view")) return null;
  const { dueReminders } = await import("@/server/services/reminders");
  return dueReminders();
}

/** Call history of one payment reminder, with times already formatted in business time. */
export async function reminderHistoryAction(id: number) {
  const actor = await currentActor();
  if (!actor || !can(actor, "reminders.view") || !Number.isInteger(id) || id <= 0) return [];
  const { reminderHistory } = await import("@/server/services/reminders");
  const { formatDateTime } = await import("@/lib/dates");
  return (await reminderHistory(id)).map(e => ({ ...e, atText: formatDateTime(e.at), nextAtText: e.nextAt ? formatDateTime(e.nextAt) : null }));
}
