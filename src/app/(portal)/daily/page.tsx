import Link from "next/link";
import { Banknote, FileDown, HandCoins, PiggyBank, Receipt, TrendingUp, Undo2 } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { periodStatement } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { Money, PageHeader, StatCard, StatusBadge } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PeriodPicker, PrintButton } from "@/components/client-kit";
import { formatDate, presetRange } from "@/lib/dates";
import { formatQty } from "@/lib/money";

export const metadata = { title: "Daily statement" };

export default async function DailyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("reports.view");
  const sp = await searchParams;
  const r = presetRange(sp.period, sp.from, sp.to);
  const [d, s] = await Promise.all([periodStatement(r.from, r.to), getSettings()]);
  const sym = s.currencySymbol;
  const x = d.summary;
  const M = (v: string) => <Money value={v} symbol={sym} />;
  return (
    <>
      <PageHeader title={r.from === r.to ? `Daily statement — ${formatDate(r.from)}` : `Statement ${formatDate(r.from)} – ${formatDate(r.to)}`}
        description="Sales revenue, money collected, new receivables, advances, expenses and cash are separate figures: a credit sale is not cash, and an invoice and its payment are not two sales."
        actions={<><PrintButton /><Button variant="outline" asChild><a href={`/api/pdf/daily?from=${r.from}&to=${r.to}`} target="_blank" rel="noreferrer"><FileDown />PDF report</a></Button></>} />
      <div className="mb-5"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="1 · Sales revenue" value={M(x.totalSales)} hint={`${x.invoiceCount} invoices · ${x.customersServed} customers · ${formatQty(x.quantity)} units`} icon={TrendingUp} tone="primary" />
        <StatCard title="2 · Payments collected" value={M(x.collections)} hint={`${sym}${x.cashSales} for these sales · ${sym}${x.collectedForDebt} old debts`} icon={Banknote} tone="success" />
        <StatCard title="3 · New receivables (credit sales)" value={M(x.creditSales)} hint={`Receivables at end of period: ${sym}${x.receivablesAtEnd}`} icon={HandCoins} tone="danger" />
        <StatCard title="4 · Advance payments received" value={M(x.advanceReceived)} hint={`Advance credit held at end: ${sym}${x.advanceCreditsAtEnd}`} icon={PiggyBank} tone="warning" />
        <StatCard title="5 · Expenses" value={M(x.expenses)} icon={Receipt} href={`/expenses?period=custom&from=${r.from}&to=${r.to}`} />
        <StatCard title="Refunds + reversals" value={M((Number(x.refunds) + Number(x.reversals)).toFixed(2))} hint={`Refunds ${sym}${x.refunds} · reversed ${sym}${x.reversals}`} icon={Undo2} />
        <StatCard title="6 · Net cash movement" value={M(x.netCash)} hint="Collected − expenses − refunds − reversals" icon={Banknote} tone={Number(x.netCash) >= 0 ? "success" : "danger"} />
        <StatCard title="Discounts / returns" value={M(x.discounts)} hint={`Returns credited ${sym}${x.returns} · cancelled ${x.cancelledCount} (${sym}${x.cancelledAmount})`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>How the sales were paid</CardTitle><CardDescription>Splits the {sym}{x.totalSales} of sales.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Line k="Paid at the counter (cash / mobile / bank)" v={M(x.cashSales)} />
            <Line k="Covered by customers' advance credit" v={M(x.creditUsedAtSale)} />
            <Line k="On credit — still owed" v={M(x.creditSales)} />
            <div className="border-t pt-2"><Line k={<b>Total sales</b>} v={<b>{M(x.totalSales)}</b>} /></div>
            <Line k="Discounts given" v={M(x.discounts)} /><Line k="Extra charges" v={M(x.charges)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cash book by method</CardTitle><CardDescription>Money in (payments) and out (expenses, refunds, reversals).</CardDescription></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table><THead><TR><TH>Method</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH><TH className="text-right">Net</TH></TR></THead>
              <TBody>{d.cashBook.length ? d.cashBook.map(c => <TR key={c.methodId}><TD>{c.name}</TD><TD className="text-right">{M(c.in)}</TD><TD className="text-right">{M(c.out)}</TD><TD className="text-right font-medium">{M(c.net)}</TD></TR>) : <TR><TD colSpan={4} className="text-muted-foreground">No money movement.</TD></TR>}</TBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sales by product</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table><THead><TR><TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Amount</TH></TR></THead>
              <TBody>{d.byProduct.length ? d.byProduct.map(p => <TR key={p.productId}><TD>{p.name}</TD><TD className="text-right tabular">{formatQty(p.quantity)}</TD><TD className="text-right">{M(p.amount)}</TD></TR>) : <TR><TD colSpan={3} className="text-muted-foreground">No sales.</TD></TR>}</TBody></Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Sales ({d.sales.length})</CardTitle></CardHeader><CardContent className="px-0 pb-2">
          <Table><THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Customer</TH><TH className="text-right">Qty</TH><TH className="text-right">Total</TH><TH className="text-right">Paid at sale</TH><TH>Status</TH></TR></THead>
            <TBody>{d.sales.map(x2 => <TR key={x2.id}><TD><Link href={`/invoices/${x2.id}`} className="text-primary hover:underline">{x2.number}</Link></TD><TD>{formatDate(x2.date)}</TD><TD>{x2.customerName}</TD><TD className="text-right tabular">{formatQty(x2.quantity)}</TD><TD className="text-right">{M(x2.total)}</TD><TD className="text-right">{M(x2.paidAtSale)}</TD><TD><StatusBadge status={x2.status} /></TD></TR>)}</TBody></Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Payments ({d.payments.length})</CardTitle></CardHeader><CardContent className="px-0 pb-2">
          <Table><THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Customer</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH className="text-right">Advance</TH></TR></THead>
            <TBody>{d.payments.map(p => <TR key={p.id} className={p.status === "REVERSED" ? "text-muted-foreground line-through" : ""}><TD><Link href={`/payments/${p.id}`} className="text-primary hover:underline">{p.number}</Link>{p.atSale && <span className="ml-1 text-xs text-muted-foreground">at sale</span>}</TD><TD>{formatDate(p.date)}</TD><TD>{p.customerName}</TD><TD>{p.method}</TD><TD className="text-right">{M(p.amount)}</TD><TD className="text-right">{M(p.advance)}</TD></TR>)}</TBody></Table>
        </CardContent></Card>
        {d.expenses.length > 0 && <Card><CardHeader><CardTitle>Expenses ({d.expenses.length})</CardTitle></CardHeader><CardContent className="px-0 pb-2">
          <Table><THead><TR><TH>No.</TH><TH>Date</TH><TH>Category</TH><TH>Description</TH><TH>Method</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>{d.expenses.map(e => <TR key={e.id}><TD>{e.number}</TD><TD>{formatDate(e.date)}</TD><TD>{e.category}</TD><TD>{e.description}</TD><TD>{e.method}</TD><TD className="text-right">{M(e.amount)}</TD></TR>)}</TBody></Table>
        </CardContent></Card>}
        {d.refunds.length > 0 && <Card><CardHeader><CardTitle>Refunds</CardTitle></CardHeader><CardContent className="px-0 pb-2">
          <Table><TBody>{d.refunds.map(rf => <TR key={rf.id}><TD>{formatDate(rf.date)}</TD><TD>{rf.customerName}</TD><TD>{rf.reason}</TD><TD>{rf.method}</TD><TD className="text-right">{M(rf.amount)}</TD></TR>)}</TBody></Table>
        </CardContent></Card>}
      </div>
    </>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
