// Statements and reports. Everything is computed from posted records (ledger, invoices, payments, expenses,
// stock movements) — never from totals typed by a user.
import { prisma } from "../db";
import { D, money, sum, type Decimal } from "@/lib/money";
import { addDays, dbDate, isoOf, startOfMonth, todayIso } from "@/lib/dates";
import { LEDGER_TYPES, type LedgerType } from "@/lib/constants";

// ───────── Customer statement ─────────

export async function customerStatement(customerId: number, from: string, to: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { addresses: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], take: 1, include: { district: true, neighborhood: true, place: true } }, group: true },
  });
  if (!customer) return null;
  const before = await prisma.ledgerEntry.aggregate({ where: { customerId, txDate: { lt: dbDate(from) } }, _sum: { debit: true, credit: true } });
  const opening = money(D(before._sum.debit ?? 0).minus(D(before._sum.credit ?? 0)));
  const entries = await prisma.ledgerEntry.findMany({ where: { customerId, txDate: { gte: dbDate(from), lte: dbDate(to) } }, orderBy: [{ txDate: "asc" }, { seq: "asc" }] });
  let running = opening;
  const rows = entries.map(e => {
    running = money(running.plus(e.debit).minus(e.credit));
    return {
      id: e.id.toString(), date: isoOf(e.txDate), type: e.type as LedgerType, typeLabel: LEDGER_TYPES[e.type as LedgerType]?.label ?? e.type,
      reference: e.reference, description: e.description, debit: D(e.debit).toFixed(2), credit: D(e.credit).toFixed(2), balance: running.toFixed(2),
      invoiceId: e.invoiceId, paymentId: e.paymentId, creditNoteId: e.creditNoteId,
    };
  });
  const totalDebit = money(sum(entries.map(e => e.debit)));
  const totalCredit = money(sum(entries.map(e => e.credit)));
  return { customer, from, to, opening: opening.toFixed(2), totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2), closing: running.toFixed(2), rows };
}

/** Ledger journal across customers (or one customer), newest first, with the posting-order running balance. */
export async function ledgerJournal(opts: { customerId?: number; from: string; to: string; type?: string; take?: number; skip?: number }) {
  const where = {
    txDate: { gte: dbDate(opts.from), lte: dbDate(opts.to) },
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.type ? { type: opts.type } : {}),
  };
  const [rows, total, agg] = await Promise.all([
    prisma.ledgerEntry.findMany({ where, orderBy: [{ txDate: "desc" }, { id: "desc" }], take: opts.take ?? 50, skip: opts.skip ?? 0, include: { customer: { select: { id: true, name: true, code: true } }, createdBy: { select: { fullName: true } } } }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.aggregate({ where, _sum: { debit: true, credit: true } }),
  ]);
  return { rows, total, debit: D(agg._sum.debit ?? 0), credit: D(agg._sum.credit ?? 0) };
}

// ───────── Period (daily / weekly / monthly) statement ─────────

export async function periodStatement(from: string, to: string) {
  const range = { gte: dbDate(from), lte: dbDate(to) };
  const [sales, cancelled, payments, reversals, refunds, expenses, returns, adjustments, debitNotes, methods] = await Promise.all([
    prisma.invoice.findMany({ where: { kind: "SALE", invoiceDate: range, status: { not: "CANCELLED" } }, include: { items: true }, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }] }),
    prisma.invoice.findMany({ where: { kind: "SALE", status: "CANCELLED", cancelledAt: { gte: dbDate(from), lt: dbDate(addDays(to, 1)) } }, select: { id: true, number: true, total: true, customerName: true, cancelReason: true } }),
    prisma.payment.findMany({ where: { paymentDate: range }, include: { method: true, customer: { select: { id: true, name: true } } }, orderBy: [{ paymentDate: "asc" }, { id: "asc" }] }),
    prisma.ledgerEntry.findMany({ where: { type: "PAYMENT_REVERSAL", txDate: range }, select: { debit: true, paymentId: true, reference: true } }),
    prisma.refund.findMany({ where: { refundDate: range }, include: { method: true, customer: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { expenseDate: range, status: "POSTED" }, include: { category: true, method: true }, orderBy: [{ expenseDate: "asc" }, { id: "asc" }] }),
    prisma.creditNote.findMany({ where: { kind: "RETURN", noteDate: range } }),
    prisma.creditNote.findMany({ where: { kind: "ADJUSTMENT", noteDate: range } }),
    prisma.invoice.findMany({ where: { kind: "DEBIT_NOTE", invoiceDate: range, status: { not: "CANCELLED" } } }),
    prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  const totalSales = money(sum(sales.map(s => s.total)));
  const paidAtSale = money(sum(sales.map(s => s.paidAtSale)));
  // advance credit used at the moment of sale (recorded on the invoice when it was posted)
  const creditUsedAtSale = money(sum(sales.map(s => s.creditAtSale)));
  const creditSales = money(totalSales.minus(paidAtSale).minus(creditUsedAtSale));
  const quantity = sum(sales.flatMap(s => s.items.map(i => i.quantity)));
  const discounts = money(sum(sales.map(s => s.discount)));
  const charges = money(sum(sales.map(s => s.charges)));

  const collections = money(sum(payments.map(p => p.amount)));
  const collectedAtSale = money(sum(payments.filter(p => p.receivedAtSale).map(p => p.amount)));
  const advanceReceived = money(sum(payments.map(p => p.advanceAtReceipt)));
  // collections split: paid for today's sales | settled older debts | kept as advance credit
  const collectedForDebt = money(collections.minus(paidAtSale).minus(advanceReceived));
  const reversed = money(sum(reversals.map(r => r.debit)));
  const refundTotal = money(sum(refunds.map(r => r.amount)));
  const expenseTotal = money(sum(expenses.map(e => e.amount)));
  const netCash = money(collections.minus(reversed).minus(refundTotal).minus(expenseTotal));

  // cash book per payment method
  const reversalByMethod = new Map<number, Decimal>();
  if (reversals.length) {
    const reversedPayments = await prisma.payment.findMany({ where: { id: { in: reversals.map(r => r.paymentId!).filter(Boolean) } }, select: { id: true, methodId: true, amount: true } });
    for (const p of reversedPayments) reversalByMethod.set(p.methodId, (reversalByMethod.get(p.methodId) ?? D(0)).plus(p.amount));
  }
  const cashBook = methods.map(m => {
    const inflow = money(sum(payments.filter(p => p.methodId === m.id).map(p => p.amount)));
    const out = money(sum(expenses.filter(e => e.methodId === m.id).map(e => e.amount)).plus(sum(refunds.filter(r => r.methodId === m.id).map(r => r.amount))).plus(reversalByMethod.get(m.id) ?? 0));
    return { methodId: m.id, name: m.name, kind: m.kind, in: inflow.toFixed(2), out: out.toFixed(2), net: money(inflow.minus(out)).toFixed(2) };
  }).filter(r => r.in !== "0.00" || r.out !== "0.00");

  // sales by product
  const byProduct = new Map<number, { productId: number; name: string; quantity: Decimal; amount: Decimal }>();
  for (const s of sales) for (const i of s.items) {
    const cur = byProduct.get(i.productId) ?? { productId: i.productId, name: `${i.productName}`, quantity: D(0), amount: D(0) };
    cur.quantity = cur.quantity.plus(i.quantity); cur.amount = cur.amount.plus(i.lineTotal);
    byProduct.set(i.productId, cur);
  }
  const expByCat = new Map<string, Decimal>();
  for (const e of expenses) expByCat.set(e.category.name, (expByCat.get(e.category.name) ?? D(0)).plus(e.amount));

  // receivables as of the end of the period (from the ledger)
  const asOf = await balancesAsOf(to);

  return {
    from, to,
    summary: {
      totalSales: totalSales.toFixed(2),
      invoiceCount: sales.length,
      customersServed: new Set(sales.map(s => s.customerId)).size,
      quantity: quantity.toString(),
      cashSales: paidAtSale.toFixed(2),
      creditUsedAtSale: creditUsedAtSale.toFixed(2),
      creditSales: creditSales.toFixed(2),
      discounts: discounts.toFixed(2),
      charges: charges.toFixed(2),
      collections: collections.toFixed(2),
      collectedAtSale: collectedAtSale.toFixed(2),
      collectedForDebt: collectedForDebt.toFixed(2),
      advanceReceived: advanceReceived.toFixed(2),
      reversals: reversed.toFixed(2),
      refunds: refundTotal.toFixed(2),
      returns: money(sum(returns.map(r => r.amount))).toFixed(2),
      creditAdjustments: money(sum(adjustments.map(r => r.amount))).toFixed(2),
      debitAdjustments: money(sum(debitNotes.map(r => r.total))).toFixed(2),
      expenses: expenseTotal.toFixed(2),
      netCash: netCash.toFixed(2),
      outstandingGenerated: creditSales.toFixed(2),
      cancelledCount: cancelled.length,
      cancelledAmount: money(sum(cancelled.map(c => c.total))).toFixed(2),
      receivablesAtEnd: asOf.receivables.toFixed(2),
      advanceCreditsAtEnd: asOf.advances.toFixed(2),
    },
    cashBook,
    byProduct: [...byProduct.values()].map(p => ({ ...p, quantity: p.quantity.toString(), amount: money(p.amount).toFixed(2) })).sort((a, b) => Number(b.amount) - Number(a.amount)),
    expensesByCategory: [...expByCat.entries()].map(([name, amount]) => ({ name, amount: money(amount).toFixed(2) })),
    sales: sales.map(s => ({ id: s.id, number: s.number, date: isoOf(s.invoiceDate), customerId: s.customerId, customerName: s.customerName, quantity: sum(s.items.map(i => i.quantity)).toString(), total: D(s.total).toFixed(2), paidAtSale: D(s.paidAtSale).toFixed(2), status: s.status })),
    payments: payments.map(p => ({ id: p.id, number: p.number, date: isoOf(p.paymentDate), customerId: p.customerId, customerName: p.customer.name, method: p.method.name, amount: D(p.amount).toFixed(2), advance: D(p.advanceAtReceipt).toFixed(2), atSale: p.receivedAtSale, status: p.status })),
    expenses: expenses.map(e => ({ id: e.id, number: e.number, date: isoOf(e.expenseDate), category: e.category.name, description: e.description, method: e.method.name, amount: D(e.amount).toFixed(2) })),
    refunds: refunds.map(r => ({ id: r.id, date: isoOf(r.refundDate), customerName: r.customer.name, method: r.method.name, amount: D(r.amount).toFixed(2), reason: r.reason })),
    cancelled: cancelled.map(c => ({ ...c, total: D(c.total).toFixed(2) })),
  };
}

/** Customer balances from the ledger as of a date: receivables (owed to us) and advances (owed to customers). */
export async function balancesAsOf(to: string) {
  const rows = await prisma.ledgerEntry.groupBy({ by: ["customerId"], where: { txDate: { lte: dbDate(to) } }, _sum: { debit: true, credit: true } });
  let receivables = D(0), advances = D(0), owing = 0, inCredit = 0;
  for (const r of rows) {
    const b = D(r._sum.debit ?? 0).minus(D(r._sum.credit ?? 0));
    if (b.greaterThan(0)) { receivables = receivables.plus(b); owing++; }
    if (b.lessThan(0)) { advances = advances.plus(b.neg()); inCredit++; }
  }
  return { receivables: money(receivables), advances: money(advances), owing, inCredit };
}

// ───────── Dashboard ─────────

export async function dashboard() {
  const today = todayIso();
  const monthStart = startOfMonth(today);
  const trendFrom = addDays(today, -29);
  const [customers, activeCustomers, todayStmt, monthStmt, balances, recentInvoices, recentPayments, lowStock, trendRows, trendPay, top] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: "ACTIVE" } }),
    periodStatement(today, today),
    periodStatement(monthStart, today),
    balancesAsOf(today),
    prisma.invoice.findMany({ where: { kind: "SALE" }, orderBy: { id: "desc" }, take: 6, select: { id: true, number: true, customerName: true, total: true, amountSettled: true, status: true, invoiceDate: true, dueDate: true } }),
    prisma.payment.findMany({ orderBy: { id: "desc" }, take: 6, include: { customer: { select: { name: true } }, method: { select: { name: true } } } }),
    prisma.product.findMany({ where: { status: "ACTIVE", trackStock: true }, include: { stock: true } }),
    prisma.invoice.groupBy({ by: ["invoiceDate"], where: { kind: "SALE", status: { not: "CANCELLED" }, invoiceDate: { gte: dbDate(trendFrom), lte: dbDate(today) } }, _sum: { total: true, totalQuantity: true } }),
    prisma.payment.groupBy({ by: ["paymentDate"], where: { paymentDate: { gte: dbDate(trendFrom), lte: dbDate(today) } }, _sum: { amount: true } }),
    prisma.invoice.groupBy({ by: ["customerId"], where: { kind: "SALE", status: { not: "CANCELLED" }, invoiceDate: { gte: dbDate(monthStart), lte: dbDate(today) } }, _sum: { total: true, totalQuantity: true }, orderBy: { _sum: { total: "desc" } }, take: 5 }),
  ]);
  const topCustomers = top.length ? await prisma.customer.findMany({ where: { id: { in: top.map(t => t.customerId) } }, select: { id: true, name: true, code: true, balance: true } }) : [];
  const trend = [];
  for (let d = trendFrom; d <= today; d = addDays(d, 1)) {
    const s = trendRows.find(r => isoOf(r.invoiceDate) === d);
    const p = trendPay.find(r => isoOf(r.paymentDate) === d);
    trend.push({ date: d, sales: Number(D(s?._sum.total ?? 0).toFixed(2)), collections: Number(D(p?._sum.amount ?? 0).toFixed(2)), quantity: Number(D(s?._sum.totalQuantity ?? 0).toString()) });
  }
  const monthRevenue = D(monthStmt.summary.totalSales);
  const monthExpenses = D(monthStmt.summary.expenses);
  return {
    today,
    customers, activeCustomers,
    todaySales: todayStmt.summary.totalSales, todayCollections: todayStmt.summary.collections, todayQuantity: todayStmt.summary.quantity, todayInvoices: todayStmt.summary.invoiceCount,
    outstanding: balances.receivables.toFixed(2), owingCustomers: balances.owing, advances: balances.advances.toFixed(2), creditCustomers: balances.inCredit,
    monthRevenue: monthRevenue.toFixed(2), monthExpenses: monthExpenses.toFixed(2), monthNet: money(monthRevenue.minus(monthExpenses)).toFixed(2), monthQuantity: monthStmt.summary.quantity, monthCollections: monthStmt.summary.collections,
    lowStock: lowStock.filter(p => D(p.stock?.onHand ?? 0).lessThanOrEqualTo(p.reorderLevel)).map(p => ({ id: p.id, name: p.name, onHand: D(p.stock?.onHand ?? 0).toString(), reorderLevel: D(p.reorderLevel).toString(), saleUnit: p.saleUnit })),
    recentInvoices: recentInvoices.map(i => ({ ...i, total: D(i.total).toFixed(2), amountSettled: D(i.amountSettled).toFixed(2), invoiceDate: isoOf(i.invoiceDate), dueDate: isoOf(i.dueDate) })),
    recentPayments: recentPayments.map(p => ({ id: p.id, number: p.number, customer: p.customer.name, method: p.method.name, amount: D(p.amount).toFixed(2), date: isoOf(p.paymentDate), status: p.status })),
    topCustomers: top.map(t => { const c = topCustomers.find(x => x.id === t.customerId); return { id: t.customerId, name: c?.name ?? "?", code: c?.code ?? "", sales: D(t._sum.total ?? 0).toFixed(2), quantity: D(t._sum.totalQuantity ?? 0).toString(), balance: D(c?.balance ?? 0).toFixed(2) }; }),
    trend,
    productMix: monthStmt.byProduct,
  };
}

// ───────── Financial reports ─────────

export async function profitAndLoss(from: string, to: string) {
  const range = { gte: dbDate(from), lte: dbDate(to) };
  const [items, returns, creditAdj, debitNotes, expenses] = await Promise.all([
    prisma.invoiceItem.findMany({ where: { invoice: { kind: "SALE", status: { not: "CANCELLED" }, invoiceDate: range } }, select: { quantity: true, lineTotal: true, unitCost: true } }),
    prisma.creditNoteItem.findMany({ where: { creditNote: { kind: "RETURN", noteDate: range } }, select: { quantity: true, lineTotal: true, invoiceItemId: true } }),
    prisma.creditNote.aggregate({ where: { kind: "ADJUSTMENT", noteDate: range }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { kind: "DEBIT_NOTE", status: { not: "CANCELLED" }, invoiceDate: range }, _sum: { total: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { expenseDate: range, status: "POSTED" }, _sum: { amount: true } }),
  ]);
  const invoiceLevel = await prisma.invoice.aggregate({ where: { kind: "SALE", status: { not: "CANCELLED" }, invoiceDate: range }, _sum: { discount: true, charges: true } });
  const cats = await prisma.expenseCategory.findMany();
  const gross = money(sum(items.map(i => i.lineTotal)));
  const discounts = money(D(invoiceLevel._sum.discount ?? 0));
  const charges = money(D(invoiceLevel._sum.charges ?? 0));
  const returnsAmt = money(sum(returns.map(r => r.lineTotal)));
  const creditAdjAmt = money(D(creditAdj._sum.amount ?? 0));
  const debitAdjAmt = money(D(debitNotes._sum.total ?? 0));
  const netRevenue = money(gross.minus(discounts).plus(charges).minus(returnsAmt).minus(creditAdjAmt).plus(debitAdjAmt));
  // cost of goods sold at the unit cost frozen on the invoice line, less returned quantities
  let cogs = sum(items.map(i => D(i.quantity).mul(i.unitCost)));
  if (returns.length) {
    const retItems = await prisma.invoiceItem.findMany({ where: { id: { in: returns.map(r => r.invoiceItemId!).filter(Boolean) } }, select: { id: true, unitCost: true } });
    cogs = cogs.minus(sum(returns.map(r => D(r.quantity).mul(retItems.find(x => x.id === r.invoiceItemId)?.unitCost ?? 0))));
  }
  cogs = money(cogs);
  const grossProfit = money(netRevenue.minus(cogs));
  const expenseRows = expenses.map(e => ({ category: cats.find(c => c.id === e.categoryId)?.name ?? "?", amount: money(D(e._sum.amount ?? 0)).toFixed(2) })).sort((a, b) => Number(b.amount) - Number(a.amount));
  const expenseTotal = money(sum(expenses.map(e => e._sum.amount ?? 0)));
  return {
    from, to,
    gross: gross.toFixed(2), discounts: discounts.toFixed(2), charges: charges.toFixed(2), returns: returnsAmt.toFixed(2), creditAdjustments: creditAdjAmt.toFixed(2), debitAdjustments: debitAdjAmt.toFixed(2),
    netRevenue: netRevenue.toFixed(2), cogs: cogs.toFixed(2), grossProfit: grossProfit.toFixed(2), expenses: expenseRows, expenseTotal: expenseTotal.toFixed(2),
    netProfit: money(grossProfit.minus(expenseTotal)).toFixed(2),
  };
}

/** Receivables aging by due date (open invoices only). */
export async function agingReport(asOf = todayIso()) {
  const open = await prisma.invoice.findMany({ where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, select: { id: true, number: true, customerId: true, customerName: true, invoiceDate: true, dueDate: true, total: true, amountSettled: true } });
  const buckets = ["current", "1-30", "31-60", "61-90", "90+"] as const;
  const perCustomer = new Map<number, { customerId: number; name: string; total: Decimal; b: Record<string, Decimal> }>();
  const totals: Record<string, Decimal> = Object.fromEntries(buckets.map(b => [b, D(0)]));
  for (const inv of open) {
    const out = D(inv.total).minus(inv.amountSettled);
    const due = isoOf(inv.dueDate ?? inv.invoiceDate);
    const days = Math.floor((dbDate(asOf).getTime() - dbDate(due).getTime()) / 86_400_000);
    const b = days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    const c = perCustomer.get(inv.customerId) ?? { customerId: inv.customerId, name: inv.customerName, total: D(0), b: Object.fromEntries(buckets.map(x => [x, D(0)])) };
    c.b[b] = c.b[b].plus(out); c.total = c.total.plus(out);
    perCustomer.set(inv.customerId, c);
    totals[b] = totals[b].plus(out);
  }
  return {
    asOf, buckets,
    totals: Object.fromEntries(buckets.map(b => [b, money(totals[b]).toFixed(2)])) as Record<string, string>,
    grand: money(sum(Object.values(totals))).toFixed(2),
    rows: [...perCustomer.values()].sort((a, b) => b.total.comparedTo(a.total)).map(c => ({ customerId: c.customerId, name: c.name, total: money(c.total).toFixed(2), b: Object.fromEntries(buckets.map(x => [x, money(c.b[x]).toFixed(2)])) as Record<string, string> })),
  };
}

export async function topCustomers(from: string, to: string, take = 20) {
  const rows = await prisma.invoice.groupBy({ by: ["customerId"], where: { kind: "SALE", status: { not: "CANCELLED" }, invoiceDate: { gte: dbDate(from), lte: dbDate(to) } }, _sum: { total: true, totalQuantity: true }, _count: { _all: true }, orderBy: { _sum: { total: "desc" } }, take });
  const cs = await prisma.customer.findMany({ where: { id: { in: rows.map(r => r.customerId) } }, select: { id: true, name: true, code: true, balance: true } });
  return rows.map(r => { const c = cs.find(x => x.id === r.customerId); return { customerId: r.customerId, name: c?.name ?? "?", code: c?.code ?? "", invoices: r._count._all, quantity: D(r._sum.totalQuantity ?? 0).toString(), sales: D(r._sum.total ?? 0).toFixed(2), balance: D(c?.balance ?? 0).toFixed(2) }; });
}
