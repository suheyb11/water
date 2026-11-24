import Link from "next/link";
import { CheckCircle2, ShieldCheck, XCircle, AlertTriangle } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { agingReport, profitAndLoss, topCustomers } from "@/server/services/reports";
import { reconcile } from "@/server/services/reconciliation";
import { stockReport } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { Money, PageHeader } from "@/components/common";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PeriodPicker, PrintButton } from "@/components/client-kit";
import { formatDateTime, presetRange, todayIso } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { STOCK_MOVE_TYPES, type StockMoveType } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata = { title: "Financial reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("reports.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const [pl, aging, top, stock, s, rec] = await Promise.all([
    profitAndLoss(r.from, r.to), agingReport(todayIso()), topCustomers(r.from, r.to, 15), stockReport(r.from, r.to), getSettings(),
    sp.check ? reconcile() : Promise.resolve(null),
  ]);
  const sym = s.currencySymbol;
  const M = (v: string) => <Money value={v} symbol={sym} />;
  const types = Object.keys(STOCK_MOVE_TYPES) as StockMoveType[];
  return (
    <>
      <PageHeader title="Financial reports" description="Profit and loss, receivables aging, top customers, stock movement and the integrity check." actions={<PrintButton />} />
      <div className="mb-5"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profit and loss</CardTitle><CardDescription>Revenue on an accrual basis (sales when made), cost at the cost price frozen on each invoice line.</CardDescription></CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            <L k="Gross sales" v={M(pl.gross)} />
            <L k="− Discounts" v={M(pl.discounts)} /><L k="+ Extra charges" v={M(pl.charges)} />
            <L k="− Returns" v={M(pl.returns)} /><L k="− Credit adjustments" v={M(pl.creditAdjustments)} /><L k="+ Debit adjustments" v={M(pl.debitAdjustments)} />
            <L k={<b>Net revenue</b>} v={<b>{M(pl.netRevenue)}</b>} line />
            <L k="− Cost of goods sold" v={M(pl.cogs)} />
            <L k={<b>Gross profit</b>} v={<b>{M(pl.grossProfit)}</b>} line />
            {pl.expenses.map(e => <L key={e.category} k={`− ${e.category}`} v={M(e.amount)} />)}
            <L k={<b>Net profit</b>} v={<b className={Number(pl.netProfit) < 0 ? "text-destructive" : "text-success"}>{M(pl.netProfit)}</b>} line />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Receivables aging (today)</CardTitle><CardDescription>Open invoices by days past their due date. Total {sym}{aging.grand}.</CardDescription></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><TR><TH>Customer</TH>{aging.buckets.map(b => <TH key={b} className="text-right">{b === "current" ? "Not due" : `${b} d`}</TH>)}<TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {aging.rows.slice(0, 25).map(a => (
                  <TR key={a.customerId}><TD><Link href={`/customers/${a.customerId}?tab=invoices`} className="hover:underline">{a.name}</Link></TD>{aging.buckets.map(b => <TD key={b} className={cn("text-right tabular", b === "90+" && Number(a.b[b]) > 0 && "text-destructive")}>{Number(a.b[b]) ? M(a.b[b]) : ""}</TD>)}<TD className="text-right font-medium">{M(a.total)}</TD></TR>
                ))}
                <TR className="bg-muted/40 font-semibold"><TD>Total</TD>{aging.buckets.map(b => <TD key={b} className="text-right">{M(aging.totals[b])}</TD>)}<TD className="text-right">{M(aging.grand)}</TD></TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top customers</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table><THead><TR><TH>Customer</TH><TH className="text-right">Invoices</TH><TH className="text-right">Qty</TH><TH className="text-right">Sales</TH><TH className="text-right">Balance now</TH></TR></THead>
              <TBody>{top.map(t => <TR key={t.customerId}><TD><Link href={`/customers/${t.customerId}`} className="hover:underline">{t.name}</Link></TD><TD className="text-right">{t.invoices}</TD><TD className="text-right tabular">{formatQty(t.quantity)}</TD><TD className="text-right">{M(t.sales)}</TD><TD className="text-right">{M(t.balance)}</TD></TR>)}</TBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Stock movement</CardTitle><CardDescription>Opening + movements = closing, per product.</CardDescription></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table><THead><TR><TH>Product</TH><TH className="text-right">Opening</TH>{types.filter(t => stock.some(x => x.byType[t])).map(t => <TH key={t} className="text-right">{STOCK_MOVE_TYPES[t].label}</TH>)}<TH className="text-right">Closing</TH></TR></THead>
              <TBody>{stock.map(x => <TR key={x.productId}><TD>{x.name}</TD><TD className="text-right tabular">{formatQty(x.opening)}</TD>{types.filter(t => stock.some(y => y.byType[t])).map(t => <TD key={t} className="text-right tabular">{x.byType[t] ? formatQty(x.byType[t]) : ""}</TD>)}<TD className="text-right font-medium tabular">{formatQty(x.closing)}</TD></TR>)}</TBody></Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Reconciliation check</CardTitle><CardDescription>Compares every customer balance with its ledger, every invoice with its allocations, every payment with what it paid, and stock with its movements.</CardDescription></div>
          <Button asChild variant={rec ? "outline" : "default"}><Link href={`/reports?${new URLSearchParams({ ...(sp.period ? { period: sp.period } : {}), ...(sp.from ? { from: sp.from, to: sp.to ?? sp.from } : {}), check: "1" })}`}>Run check</Link></Button>
        </CardHeader>
        {rec && <CardContent>
          {rec.findings.filter(f => f.severity === "error").length === 0
            ? <Alert tone="success" title={`All balances reconcile — ${rec.customers} customers, ${rec.invoices} invoices, ${rec.payments} payments checked at ${formatDateTime(rec.checkedAt)}`} />
            : <Alert tone="danger" title={`${rec.findings.filter(f => f.severity === "error").length} integrity errors — do not post more until this is investigated`} />}
          {rec.findings.length > 0 && (
            <Table className="mt-3"><TBody>{rec.findings.map((f, i) => (
              <TR key={i}><TD className="w-8">{f.severity === "error" ? <XCircle className="size-4 text-destructive" /> : <AlertTriangle className="size-4 text-warning" />}</TD><TD>{f.area}</TD><TD>{f.href ? <Link href={f.href} className="text-primary hover:underline">{f.entity}</Link> : f.entity}</TD><TD>{f.message}</TD></TR>
            ))}</TBody></Table>
          )}
          {rec.findings.length === 0 && <p className="mt-2 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />No warnings.</p>}
        </CardContent>}
      </Card>
    </>
  );
}

function L({ k, v, line }: { k: React.ReactNode; v: React.ReactNode; line?: boolean }) {
  return <div className={cn("flex justify-between gap-3", line && "border-t pt-1.5")}><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
