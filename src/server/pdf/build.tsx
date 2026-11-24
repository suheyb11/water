// Assemble PDF data from the database and render to a Buffer.
import * as React from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import { getInvoice } from "../services/invoices";
import { getPayment } from "../services/payments";
import { customerStatement, periodStatement } from "../services/reports";
import { getSettings } from "../services/settings";
import { displayStatus } from "../services/sales";
import { addressFull, addressLine } from "@/lib/address";
import { formatDate, formatDateTime } from "@/lib/dates";
import { D, formatMoney, formatPrice, formatQty } from "@/lib/money";
import { label } from "@/lib/constants";
import { DailyDocument, InvoiceDocument, ReceiptDocument, StatementDocument } from "./documents";

async function company() {
  const s = await getSettings();
  return { co: s, sym: s.currencySymbol };
}

export async function invoicePdf(id: number): Promise<{ buffer: Buffer; filename: string } | null> {
  const inv = await getInvoice(id);
  if (!inv) return null;
  const { co, sym } = await company();
  const m = (v: unknown) => formatMoney(String(v), sym);
  const title = inv.kind === "SALE" ? "Invoice" : inv.kind === "DEBIT_NOTE" ? "Debit note" : inv.kind === "REFUND" ? "Refund" : "Opening balance";
  const out = inv.status === "CANCELLED" ? D(0) : D(inv.total).minus(inv.amountSettled);
  const doc = (
    <InvoiceDocument co={co} title={title} number={inv.number} date={formatDate(inv.invoiceDate)} due={inv.kind === "SALE" && inv.dueDate ? formatDate(inv.dueDate) : null}
      status={displayStatus(inv)} cancelled={inv.status === "CANCELLED" ? `${inv.cancelReason ?? ""}` : null}
      customer={{ name: inv.customerName, code: inv.customer.code, phone: inv.customerPhone, address: inv.addressText }}
      items={inv.items.map(i => ({ no: i.lineNo, name: i.productName, detail: `${Number(i.capacity)} ${i.capacityUnit} · ${i.productCode}${D(i.quantityReturned).greaterThan(0) ? ` · ${formatQty(i.quantityReturned.toString())} returned` : ""}`, qty: `${formatQty(i.quantity.toString())} ${i.saleUnit}`, unitPrice: formatPrice(i.unitPrice.toString(), sym), total: m(i.lineTotal) }))}
      subtotal={m(inv.subtotal)} discount={D(inv.discount).greaterThan(0) ? m(inv.discount) : null} charges={D(inv.charges).greaterThan(0) ? m(inv.charges) : null}
      total={m(inv.total)} paid={m(inv.amountSettled)} outstanding={m(out)} notes={inv.notes}
      payments={inv.allocations.filter(a => !a.reversedAt).map(a => ({ ref: a.payment?.number ?? a.creditNote?.number ?? "", date: formatDate(a.allocatedOn), method: a.payment?.method.name ?? label(a.creditNote?.kind), amount: m(a.amount) }))}
      generated={formatDateTime(new Date())} />
  );
  return { buffer: await renderToBuffer(doc), filename: `${inv.number}.pdf` };
}

export async function receiptPdf(id: number) {
  const p = await getPayment(id);
  if (!p) return null;
  const { co, sym } = await company();
  const free = p.status === "POSTED" ? D(p.amount).minus(p.allocated) : D(0);
  const doc = (
    <ReceiptDocument co={co} number={p.number} date={formatDate(p.paymentDate)} status={p.status}
      customer={{ name: p.customer.name, code: p.customer.code, phone: p.customer.phone, address: addressLine(p.customer.addresses[0]) }}
      amount={formatMoney(p.amount.toString(), sym)} method={p.method.name} reference={p.reference}
      lines={p.allocations.filter(a => !a.reversedAt).map(a => ({ ref: a.invoice.number, amount: formatMoney(a.amount.toString(), sym) }))}
      advance={free.greaterThan(0) ? formatMoney(free.toString(), sym) : null} generated={formatDateTime(new Date())} recordedBy={p.createdBy.fullName} />
  );
  return { buffer: await renderToBuffer(doc), filename: `${p.number}.pdf` };
}

export async function statementPdf(customerId: number, from: string, to: string) {
  const st = await customerStatement(customerId, from, to);
  if (!st) return null;
  const { co, sym } = await company();
  const m = (v: string) => (D(v).isZero() ? "" : formatMoney(v, sym));
  const closing = D(st.closing);
  const doc = (
    <StatementDocument co={co} from={formatDate(from)} to={formatDate(to)} generated={formatDateTime(new Date())}
      customer={{ name: st.customer.name, code: st.customer.code, phone: st.customer.phone, address: addressFull(st.customer.addresses[0]) }}
      opening={formatMoney(st.opening, sym)} totalDebit={formatMoney(st.totalDebit, sym)} totalCredit={formatMoney(st.totalCredit, sym)} closing={formatMoney(st.closing, sym)}
      closingNote={closing.greaterThan(0) ? "Amount due" : closing.lessThan(0) ? "Credit in the customer's favour" : "Settled"}
      rows={st.rows.map(r => ({ date: formatDate(r.date), ref: r.reference, type: r.typeLabel, description: r.description, debit: m(r.debit), credit: m(r.credit), balance: formatMoney(r.balance, sym) }))} />
  );
  return { buffer: await renderToBuffer(doc), filename: `statement-${st.customer.code}-${from}-${to}.pdf` };
}

export async function dailyPdf(from: string, to: string) {
  const r = await periodStatement(from, to);
  const { co, sym } = await company();
  const m = (v: string) => formatMoney(v, sym);
  const x = r.summary;
  const doc = (
    <DailyDocument co={co} from={formatDate(from)} to={formatDate(to)} generated={formatDateTime(new Date())}
      blocks={[
        { title: "Sales (revenue)", rows: [["Invoices", String(x.invoiceCount)], ["Customers served", String(x.customersServed)], ["Quantity sold", formatQty(x.quantity)], ["Paid at the counter", m(x.cashSales)], ["Covered by advance credit", m(x.creditUsedAtSale)], ["On credit (new receivables)", m(x.creditSales)], ["Discounts given", m(x.discounts)], ["= Total sales", m(x.totalSales)]] },
        { title: "Money received", rows: [["For today's sales", m(x.cashSales)], ["For older debts", m(x.collectedForDebt)], ["Advance payments", m(x.advanceReceived)], ["= Total collected", m(x.collections)]] },
        { title: "Money out", rows: [["Expenses", m(x.expenses)], ["Refunds paid", m(x.refunds)], ["Payments reversed", m(x.reversals)], ["= Net cash movement", m(x.netCash)]] },
        { title: "Customer accounts", rows: [["Returns credited", m(x.returns)], ["Credit adjustments", m(x.creditAdjustments)], ["Debit adjustments", m(x.debitAdjustments)], ["Cancelled sales", `${x.cancelledCount} · ${m(x.cancelledAmount)}`], ["Receivables at end", m(x.receivablesAtEnd)], ["= Advance credit held", m(x.advanceCreditsAtEnd)]] },
      ]}
      tables={[
        { title: "Cash book by payment method", head: ["Method", "In", "Out", "Net"], widths: [0, 90, 90, 90], rows: r.cashBook.map(c => [c.name, m(c.in), m(c.out), m(c.net)]) },
        { title: "Sales by product", head: ["Product", "Qty", "Amount"], widths: [0, 80, 90], rows: r.byProduct.map(p => [p.name, formatQty(p.quantity), m(p.amount)]) },
        { title: "Sales", head: ["Invoice", "Date", "Customer", "Qty", "Total", "Paid at sale"], widths: [88, 62, 0, 40, 70, 70], rows: r.sales.map(s => [s.number, s.date, s.customerName, formatQty(s.quantity), m(s.total), m(s.paidAtSale)]) },
        { title: "Payments received", head: ["Receipt", "Date", "Customer", "Method", "Amount"], widths: [88, 62, 0, 80, 70], rows: r.payments.map(p => [p.number, p.date, p.customerName, p.method, m(p.amount)]) },
        { title: "Expenses", head: ["No.", "Date", "Category", "Description", "Amount"], widths: [80, 62, 80, 0, 70], rows: r.expenses.map(e => [e.number, e.date, e.category, e.description, m(e.amount)]) },
      ]} />
  );
  return { buffer: await renderToBuffer(doc), filename: from === to ? `daily-statement-${from}.pdf` : `statement-${from}-${to}.pdf` };
}

