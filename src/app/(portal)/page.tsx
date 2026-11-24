import Link from "next/link";
import { redirect } from "next/navigation";
import { visibleNav } from "@/lib/nav";
import { BellRing, AlertTriangle, ArrowRight, Banknote, CalendarDays, Droplets, HandCoins, PiggyBank, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { dashboard } from "@/server/services/reports";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Balance, Money, PageHeader, StatCard, StatusBadge, EmptyState } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { TrendChart, QuantityChart } from "@/components/charts";
import { formatDate } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { displayStatus } from "@/server/services/sales";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requirePage();
  if (!actor.permissions.has("dashboard.view")) {
    // roles without the dashboard (e.g. delivery staff) land on their first page
    const first = visibleNav([...actor.permissions])[0]?.items[0]?.href;
    redirect(first && first !== "/" ? first : "/unauthorized");
  }
  const [d, s, callsDue] = await Promise.all([dashboard(), getSettings(), prisma.paymentReminder.count({ where: { status: "OPEN", remindAt: { lte: new Date() } } })]);
  const sym = s.currencySymbol;
  const finance = actor.permissions.has("reports.view");
  return (
    <>
      <PageHeader title={`Good day, ${actor.fullName.split(" ")[0]}`} description={`${formatDate(d.today)} — everything below comes straight from posted sales, payments and expenses.`}
        actions={<>
          {actor.permissions.has("reminders.view") && callsDue > 0 && <Button variant="destructive" asChild><Link href="/reminders"><BellRing />{callsDue} call{callsDue > 1 ? "s" : ""} due</Link></Button>}
          {actor.permissions.has("reports.view") && <Button variant="outline" asChild><Link href="/daily"><CalendarDays />Daily statement</Link></Button>}
          {actor.permissions.has("payments.create") && <Button variant="outline" asChild><Link href="/payments/new"><Wallet />Receive payment</Link></Button>}
        </>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Today's sales" value={<Money value={d.todaySales} symbol={sym} />} hint={`${d.todayInvoices} invoices · ${formatQty(d.todayQuantity)} containers`} icon={TrendingUp} tone="primary" href="/daily" />
        <StatCard title="Collected today" value={<Money value={d.todayCollections} symbol={sym} />} hint="Payments received (cash, mobile, bank)" icon={Banknote} tone="success" href="/payments" />
        <StatCard title="Customers owe" value={<Money value={d.outstanding} symbol={sym} />} hint={`${d.owingCustomers} customers with a balance`} icon={HandCoins} tone="danger" href="/customers?balance=owing&sort=balance" />
        <StatCard title="Advance credit held" value={<Money value={d.advances} symbol={sym} />} hint={`${d.creditCustomers} customers paid ahead`} icon={PiggyBank} tone="warning" href="/customers?balance=credit" />
      </div>

      {finance && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Revenue this month" value={<Money value={d.monthRevenue} symbol={sym} />} hint={`${formatQty(d.monthQuantity)} containers sold`} icon={Droplets} />
          <StatCard title="Expenses this month" value={<Money value={d.monthExpenses} symbol={sym} />} icon={Receipt} href="/expenses?period=month" />
          <StatCard title="Revenue − expenses" value={<Money value={d.monthNet} symbol={sym} />} hint={`Collections this month: ${sym}${d.monthCollections}`} icon={TrendingUp} tone={Number(d.monthNet) >= 0 ? "success" : "danger"} href="/reports" />
          <StatCard title="Customers" value={d.customers.toLocaleString()} hint={`${d.activeCustomers} active`} icon={Users} href="/customers" />
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Sales and collections — last 30 days</CardTitle><CardDescription>Credit sales are not cash: the gap between the lines is what customers still owe or paid in advance.</CardDescription></CardHeader>
          <CardContent><TrendChart data={d.trend} symbol={sym} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Containers sold per day</CardTitle></CardHeader>
          <CardContent><QuantityChart data={d.trend} /></CardContent>
          {d.lowStock.length > 0 && (
            <div className="mx-5 mb-5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />Low stock</p>
              <ul className="mt-1 text-muted-foreground">{d.lowStock.map(p => <li key={p.id}>{p.name}: {formatQty(p.onHand)} {p.saleUnit}s (reorder at {formatQty(p.reorderLevel)})</li>)}</ul>
              <Link href="/inventory" className="mt-1 inline-block text-primary hover:underline">Record production →</Link>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Top customers this month</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {d.topCustomers.length ? (
              <Table><TBody>{d.topCustomers.map(c => (
                <TR key={c.id}><TD><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-muted-foreground">{formatQty(c.quantity)} containers</p></TD><TD className="text-right"><Money value={c.sales} symbol={sym} /><p className="text-xs"><Balance value={c.balance} symbol={sym} /></p></TD></TR>
              ))}</TBody></Table>
            ) : <EmptyState icon={Users} title="No sales yet this month" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Recent invoices</CardTitle><Link href="/invoices" className="text-sm text-primary hover:underline">All <ArrowRight className="inline size-3.5" /></Link></CardHeader>
          <CardContent className="px-0 pb-2">
            {d.recentInvoices.length ? (
              <Table><TBody>{d.recentInvoices.map(i => (
                <TR key={i.id}><TD><Link href={`/invoices/${i.id}`} className="font-medium hover:underline">{i.number}</Link><p className="text-xs text-muted-foreground">{i.customerName}</p></TD>
                  <TD className="text-right"><Money value={i.total} symbol={sym} /><div><StatusBadge status={displayStatus({ status: i.status, dueDate: i.dueDate ? new Date(i.dueDate) : null, total: i.total, amountSettled: i.amountSettled })} /></div></TD></TR>
              ))}</TBody></Table>
            ) : <EmptyState icon={Receipt} title="No invoices yet" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Recent payments</CardTitle><Link href="/payments" className="text-sm text-primary hover:underline">All <ArrowRight className="inline size-3.5" /></Link></CardHeader>
          <CardContent className="px-0 pb-2">
            {d.recentPayments.length ? (
              <Table><THead><TR><TH>Receipt</TH><TH className="text-right">Amount</TH></TR></THead><TBody>{d.recentPayments.map(p => (
                <TR key={p.id}><TD><Link href={`/payments/${p.id}`} className="font-medium hover:underline">{p.number}</Link><p className="text-xs text-muted-foreground">{p.customer} · {p.method}</p></TD><TD className="text-right"><Money value={p.amount} symbol={sym} />{p.status === "REVERSED" && <div><StatusBadge status="REVERSED" /></div>}</TD></TR>
              ))}</TBody></Table>
            ) : <EmptyState icon={Wallet} title="No payments yet" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
