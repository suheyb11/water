import Link from "next/link";
import { Droplets, ShoppingCart } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { displayStatus } from "@/server/services/sales";
import { Money, PageHeader, Pager, StatCard, StatusBadge, pageOf, EmptyState } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PeriodPicker, SearchInput } from "@/components/client-kit";
import { dbDate, formatDate, presetRange } from "@/lib/dates";
import { D, formatQty, money, sum } from "@/lib/money";

export const metadata = { title: "Sales" };
const PAGE = 30;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("invoices.view", "sales.create");
  const sp = await searchParams;
  const r = presetRange(sp.period, sp.from, sp.to);
  const page = pageOf(sp.page);
  const where = {
    kind: "SALE", invoiceDate: { gte: dbDate(r.from), lte: dbDate(r.to) },
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" as const } }, { customerName: { contains: sp.q, mode: "insensitive" as const } }, { customerPhone: { contains: sp.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, all, s] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }], take: PAGE, skip: (page - 1) * PAGE, include: { items: { select: { productName: true, quantity: true } }, createdBy: { select: { fullName: true } } } }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where: { ...where, status: { not: "CANCELLED" } }, select: { total: true, paidAtSale: true, totalQuantity: true } }),
    getSettings(),
  ]);
  const sym = s.currencySymbol;
  const totalSales = money(sum(all.map(a => a.total)));
  const cash = money(sum(all.map(a => a.paidAtSale)));
  return (
    <>
      <PageHeader title="Sales" description="Every sale posted in the period. Cancelled sales stay listed (struck through) but do not count."
        actions={actor.permissions.has("sales.create") && <Button asChild><Link href="/sales/new"><ShoppingCart />New sale</Link></Button>} />
      <div className="mb-4"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Sales" value={<Money value={totalSales.toString()} symbol={sym} />} hint={`${all.length} invoices`} icon={Droplets} tone="primary" />
        <StatCard title="Paid at the counter" value={<Money value={cash.toString()} symbol={sym} />} />
        <StatCard title="Not paid at sale" value={<Money value={totalSales.minus(cash).toString()} symbol={sym} />} hint="Credit sales + advance credit used" />
        <StatCard title="Containers / units" value={formatQty(sum(all.map(a => a.totalQuantity)).toString())} />
      </div>
      <Card>
        <div className="border-b p-3"><SearchInput placeholder="Invoice no., customer, phone" /></div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Customer</TH><TH>Items</TH><TH className="text-right">Total</TH><TH className="text-right">Paid at sale</TH><TH>Status</TH><TH>By</TH></TR></THead>
            <TBody>{rows.map(i => (
              <TR key={i.id} className={i.status === "CANCELLED" ? "text-muted-foreground line-through" : ""}>
                <TD><Link href={`/invoices/${i.id}`} className="font-medium text-primary hover:underline">{i.number}</Link></TD>
                <TD className="whitespace-nowrap">{formatDate(i.invoiceDate)}</TD>
                <TD><Link href={`/customers/${i.customerId}`} className="hover:underline">{i.customerName}</Link></TD>
                <TD className="max-w-72"><span className="line-clamp-1">{i.items.map(x => `${formatQty(x.quantity.toString())} × ${x.productName}`).join(", ")}</span></TD>
                <TD className="text-right"><Money value={i.total.toString()} symbol={sym} /></TD>
                <TD className="text-right"><Money value={D(i.paidAtSale).toString()} symbol={sym} /></TD>
                <TD><StatusBadge status={displayStatus(i)} /></TD>
                <TD className="text-muted-foreground">{i.createdBy.fullName}</TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={Droplets} title="No sales in this period" />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/sales" />
      </Card>
    </>
  );
}
