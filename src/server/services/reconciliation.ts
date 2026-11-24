// Automated integrity checks. Every rule here must hold at all times; a finding means a bug or a manual DB edit.
import { prisma } from "../db";
import { D, money, sum } from "@/lib/money";

export interface Finding { severity: "error" | "warning"; area: string; entity: string; message: string; href?: string }

export async function reconcile(): Promise<{ checkedAt: string; customers: number; invoices: number; payments: number; findings: Finding[] }> {
  const findings: Finding[] = [];
  const [customers, ledgerSums, lastEntries, seqStats, invoices, allocs, payments, notes, stock, moveSums] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, code: true, name: true, balance: true } }),
    prisma.ledgerEntry.groupBy({ by: ["customerId"], _sum: { debit: true, credit: true }, _count: { _all: true }, _max: { seq: true } }),
    prisma.ledgerEntry.findMany({ orderBy: [{ customerId: "asc" }, { seq: "desc" }], distinct: ["customerId"], select: { customerId: true, balanceAfter: true } }),
    Promise.resolve(null),
    prisma.invoice.findMany({ select: { id: true, number: true, customerId: true, status: true, kind: true, total: true, amountSettled: true, subtotal: true, discount: true, charges: true, items: { select: { lineTotal: true } } } }),
    prisma.allocation.groupBy({ by: ["invoiceId"], where: { reversedAt: null }, _sum: { amount: true } }),
    prisma.payment.findMany({ select: { id: true, number: true, customerId: true, amount: true, allocated: true, status: true, allocations: { where: { reversedAt: null }, select: { amount: true } } } }),
    prisma.creditNote.findMany({ select: { id: true, number: true, customerId: true, amount: true, allocated: true, allocations: { where: { reversedAt: null }, select: { amount: true } } } }),
    prisma.inventory.findMany({ include: { product: { select: { name: true } } } }),
    prisma.stockMovement.groupBy({ by: ["productId"], _sum: { quantity: true } }),
  ]);
  void seqStats;

  // 1. cached balance = Σ ledger = last running balance; sequence has no gaps
  for (const c of customers) {
    const s = ledgerSums.find(x => x.customerId === c.id);
    const ledger = money(D(s?._sum.debit ?? 0).minus(D(s?._sum.credit ?? 0)));
    if (!ledger.equals(D(c.balance))) findings.push({ severity: "error", area: "Ledger", entity: `${c.code} ${c.name}`, message: `Account balance ${D(c.balance).toFixed(2)} ≠ ledger total ${ledger.toFixed(2)}`, href: `/customers/${c.id}` });
    const last = lastEntries.find(x => x.customerId === c.id);
    if (last && !D(last.balanceAfter).equals(D(c.balance))) findings.push({ severity: "error", area: "Ledger", entity: `${c.code} ${c.name}`, message: `Last running balance ${D(last.balanceAfter).toFixed(2)} ≠ account balance ${D(c.balance).toFixed(2)}`, href: `/customers/${c.id}` });
    if (s && s._max.seq !== s._count._all) findings.push({ severity: "error", area: "Ledger", entity: `${c.code} ${c.name}`, message: `Ledger sequence has gaps (${s._count._all} entries, last #${s._max.seq})`, href: `/customers/${c.id}` });
  }

  // 2. invoice arithmetic and settlement
  for (const inv of invoices) {
    const alloc = money(D(allocs.find(a => a.invoiceId === inv.id)?._sum.amount ?? 0));
    if (!alloc.equals(D(inv.amountSettled))) findings.push({ severity: "error", area: "Invoices", entity: inv.number, message: `Settled ${D(inv.amountSettled).toFixed(2)} ≠ allocations ${alloc.toFixed(2)}`, href: `/invoices/${inv.id}` });
    if (inv.status !== "CANCELLED" && D(inv.amountSettled).greaterThan(inv.total)) findings.push({ severity: "error", area: "Invoices", entity: inv.number, message: "Settled more than the invoice total", href: `/invoices/${inv.id}` });
    if (inv.kind === "SALE") {
      const lines = money(sum(inv.items.map(i => i.lineTotal)));
      if (!lines.equals(D(inv.subtotal))) findings.push({ severity: "error", area: "Invoices", entity: inv.number, message: `Lines ${lines.toFixed(2)} ≠ subtotal ${D(inv.subtotal).toFixed(2)}`, href: `/invoices/${inv.id}` });
      const total = money(D(inv.subtotal).minus(inv.discount).plus(inv.charges));
      if (!total.equals(D(inv.total))) findings.push({ severity: "error", area: "Invoices", entity: inv.number, message: `Subtotal − discount + charges ≠ total`, href: `/invoices/${inv.id}` });
    }
  }

  // 3. payments / credit notes: allocated = Σ active allocations ≤ amount
  for (const p of payments) {
    const a = money(sum(p.allocations.map(x => x.amount)));
    if (!a.equals(D(p.allocated))) findings.push({ severity: "error", area: "Payments", entity: p.number, message: `Allocated ${D(p.allocated).toFixed(2)} ≠ allocations ${a.toFixed(2)}`, href: `/payments/${p.id}` });
    if (a.greaterThan(p.amount)) findings.push({ severity: "error", area: "Payments", entity: p.number, message: "Allocated more than the payment amount", href: `/payments/${p.id}` });
    if (p.status === "REVERSED" && a.greaterThan(0)) findings.push({ severity: "error", area: "Payments", entity: p.number, message: "A reversed payment still has allocations", href: `/payments/${p.id}` });
  }
  for (const n of notes) {
    const a = money(sum(n.allocations.map(x => x.amount)));
    if (!a.equals(D(n.allocated)) || a.greaterThan(n.amount)) findings.push({ severity: "error", area: "Credit notes", entity: n.number, message: `Allocated ${D(n.allocated).toFixed(2)} vs allocations ${a.toFixed(2)} (amount ${D(n.amount).toFixed(2)})` });
  }

  // 4. sub-ledger: balance = open receivables − free credit
  for (const c of customers) {
    const open = money(sum(invoices.filter(i => i.customerId === c.id && i.status !== "CANCELLED").map(i => D(i.total).minus(i.amountSettled))));
    const free = money(sum(payments.filter(p => p.customerId === c.id && p.status === "POSTED").map(p => D(p.amount).minus(p.allocated)))
      .plus(sum(notes.filter(n => n.customerId === c.id).map(n => D(n.amount).minus(n.allocated)))));
    const expected = money(open.minus(free));
    if (!expected.equals(D(c.balance))) findings.push({ severity: "error", area: "Sub-ledger", entity: `${c.code} ${c.name}`, message: `Open invoices ${open.toFixed(2)} − free credit ${free.toFixed(2)} = ${expected.toFixed(2)} ≠ balance ${D(c.balance).toFixed(2)}`, href: `/customers/${c.id}` });
    if (open.greaterThan(0) && free.greaterThan(0)) findings.push({ severity: "warning", area: "Allocation", entity: `${c.code} ${c.name}`, message: `Has ${free.toFixed(2)} unused credit while ${open.toFixed(2)} is open — use "Apply credit" on the customer`, href: `/customers/${c.id}` });
  }

  // 5. stock on hand = Σ movements
  for (const s of stock) {
    const m = D(moveSums.find(x => x.productId === s.productId)?._sum.quantity ?? 0);
    if (!m.equals(D(s.onHand))) findings.push({ severity: "error", area: "Inventory", entity: s.product.name, message: `On hand ${D(s.onHand).toString()} ≠ movements ${m.toString()}`, href: `/inventory` });
    if (D(s.onHand).isNegative()) findings.push({ severity: "warning", area: "Inventory", entity: s.product.name, message: `Stock is negative (${D(s.onHand).toString()})`, href: `/inventory` });
  }

  return { checkedAt: new Date().toISOString(), customers: customers.length, invoices: invoices.length, payments: payments.length, findings };
}
