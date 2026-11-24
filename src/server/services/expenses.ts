import { z } from "zod";
import { prisma, inTx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { D, money, toDb } from "@/lib/money";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { checkDate } from "./sales";

export const expenseInput = z.object({
  categoryId: z.coerce.number().int().positive("Choose a category"),
  expenseDate: z.string().refine(isIsoDate, "Invalid date").optional(),
  description: z.string().trim().min(2, "Describe the expense").max(400),
  amount: z.union([z.string(), z.number()]).transform(v => money(D(String(v).trim() || "0"))).refine(v => v.greaterThan(0), "Amount must be more than zero"),
  methodId: z.coerce.number().int().positive("Choose how it was paid"),
  reference: z.string().trim().max(120).optional().nullable(),
  payee: z.string().trim().max(160).optional().nullable(),
});

export async function recordExpense(actor: Actor, raw: z.input<typeof expenseInput>) {
  assertCan(actor, "expenses.manage");
  const input = expenseInput.parse(raw);
  const date = input.expenseDate ?? todayIso();
  checkDate(actor, date, "expense");
  return inTx(async tx => {
    const cat = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat || !cat.isActive) fail("Unknown expense category", "VALIDATION", "categoryId");
    const number = await nextNumber(tx, "EXP", "EXP", Number(date.slice(0, 4)));
    const row = await tx.expense.create({
      data: { number, categoryId: input.categoryId, expenseDate: dbDate(date), description: input.description, amount: toDb(input.amount), methodId: input.methodId, reference: input.reference ?? null, payee: input.payee ?? null, createdById: actor.userId },
    });
    await audit(tx, actor, "expense.record", "Expense", row.id, `${number} ${cat!.name} ${input.amount.toFixed(2)}: ${input.description}`, null, row);
    return row;
  });
}

/** Expenses are not deleted: a mistake is voided with a reason and drops out of the totals. */
export async function voidExpense(actor: Actor, id: number, reason: string) {
  assertCan(actor, "expenses.manage");
  if (!reason || reason.trim().length < 5) fail("Give the reason", "VALIDATION", "reason");
  return inTx(async tx => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) return notFound("Expense");
    if (e.status === "VOID") fail("Already void");
    const after = await tx.expense.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidedById: actor.userId, voidReason: reason.trim() } });
    await audit(tx, actor, "expense.void", "Expense", id, `${e.number} voided: ${reason}`, e, after);
    return after;
  });
}

export const categoryInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable().transform(v => v || null),
  isActive: z.union([z.boolean(), z.string()]).optional().transform(v => v === undefined ? true : v === true || v === "true" || v === "on"),
});

export async function saveExpenseCategory(actor: Actor, raw: z.input<typeof categoryInput>) {
  assertCan(actor, "expenses.manage");
  const { id, ...data } = categoryInput.parse(raw);
  return inTx(async tx => {
    const dup = await tx.expenseCategory.findFirst({ where: { name: data.name, ...(id ? { NOT: { id } } : {}) } });
    if (dup) fail("This category already exists", "VALIDATION", "name");
    const row = id ? await tx.expenseCategory.update({ where: { id }, data }) : await tx.expenseCategory.create({ data });
    await audit(tx, actor, id ? "expense_category.update" : "expense_category.create", "ExpenseCategory", row.id, row.name);
    return row;
  });
}

export async function listExpenses(opts: { from: string; to: string; categoryId?: number; q?: string; includeVoid?: boolean; take?: number; skip?: number }) {
  const where = {
    expenseDate: { gte: dbDate(opts.from), lte: dbDate(opts.to) },
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.includeVoid ? {} : { status: "POSTED" }),
    ...(opts.q ? { OR: [{ description: { contains: opts.q } }, { number: { contains: opts.q } }, { payee: { contains: opts.q } }, { reference: { contains: opts.q } }] } : {}),
  };
  const [rows, total, agg, byCat] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: [{ expenseDate: "desc" }, { id: "desc" }], take: opts.take ?? 50, skip: opts.skip ?? 0, include: { category: true, method: true, createdBy: { select: { fullName: true } } } }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { ...where, status: "POSTED" }, _sum: { amount: true } }),
  ]);
  return { rows, total, sum: D(agg._sum.amount ?? 0), byCategory: byCat.map(b => ({ categoryId: b.categoryId, amount: D(b._sum.amount ?? 0) })) };
}

export const listExpenseCategories = (activeOnly = false) => prisma.expenseCategory.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: { name: "asc" } });
