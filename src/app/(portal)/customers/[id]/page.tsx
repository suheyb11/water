import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Pencil, Phone, ScrollText, ShoppingCart, Truck, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCustomer } from "@/server/services/customers";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { locationOptions } from "@/server/services/locations";
import { customerPriceList, customerPriceHistory } from "@/server/services/pricing";
import { unallocatedCredit } from "@/server/services/posting";
import { displayStatus } from "@/server/services/sales";
import { Balance, KV, Money, PageHeader, StatusBadge, EmptyState, idOf } from "@/components/common";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { addressLine } from "@/lib/address";
import { formatDate, formatDateTime, isoOf, todayIso } from "@/lib/dates";
import { D, formatPrice, formatQty } from "@/lib/money";
import { LEDGER_TYPES, label, type LedgerType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AccountActions, AddressManager, PriceEditor } from "./customer-tools";
import { CancelReminderButton, NewReminderButton } from "@/components/reminder-center";

export const metadata = { title: "Customer" };

const TABS = [
  { key: "overview", label: "Overview" }, { key: "prices", label: "Prices" }, { key: "ledger", label: "Ledger" },
  { key: "invoices", label: "Invoices" }, { key: "payments", label: "Payments" }, { key: "deliveries", label: "Deliveries" }, { key: "history", label: "Price history" },
];

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requirePage("customers.view");
  const id = (idOf((await params).id) ?? -1);
  const { tab = "overview" } = await searchParams;
  const c = id > 0 ? await getCustomer(id) : null;
  if (!c) notFound();
  const p = actor.permissions;
  const finance = p.has("ledger.view") || p.has("invoices.view");
  const [s, methods, locations] = await Promise.all([getSettings(), listPaymentMethods(), locationOptions()]);
  const sym = s.currencySymbol;
  const today = todayIso();
  const [freeCredit, openCount, stats] = await Promise.all([
    prisma.$transaction(tx => unallocatedCredit(tx, c.id)),
    prisma.invoice.count({ where: { customerId: c.id, status: { in: ["UNPAID", "PARTIALLY_PAID"] } } }),
    prisma.invoice.aggregate({ where: { customerId: c.id, kind: "SALE", status: { not: "CANCELLED" } }, _sum: { total: true, totalQuantity: true }, _count: { _all: true }, _max: { invoiceDate: true } }),
  ]);
  const reminders = await prisma.paymentReminder.findMany({ where: { customerId: c.id, status: "OPEN" }, orderBy: { remindAt: "asc" } });
  const visibleTabs = TABS.filter(t => finance || ["overview", "prices"].includes(t.key));

  return (
    <>
      <PageHeader
        title={c.name}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>{c.code}</span><span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{c.phone}{c.altPhone ? ` / ${c.altPhone}` : ""}</span><StatusBadge status={c.status} />{c.group && <Badge tone="primary">{c.group.name}</Badge>}</span>}
        actions={<>
          {p.has("sales.create") && c.status === "ACTIVE" && <Button asChild><Link href={`/sales/new?customer=${c.id}`}><ShoppingCart />New sale</Link></Button>}
          {p.has("payments.create") && <Button variant="outline" asChild><Link href={`/payments/new?customer=${c.id}`}><Wallet />Receive payment</Link></Button>}
          {p.has("ledger.view") && <Button variant="outline" asChild><Link href={`/statements?customer=${c.id}`}><ScrollText />Statement</Link></Button>}
          {p.has("reminders.manage") && <NewReminderButton customerId={c.id} size="default" />}
          {p.has("customers.manage") && <Button variant="outline" asChild><Link href={`/customers/${c.id}/edit`}><Pencil />Edit</Link></Button>}
        </>}
      />

      {finance && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4"><p className="text-[13px] text-muted-foreground">Account balance</p><p className="mt-1 text-2xl font-semibold"><Balance value={c.balance.toString()} symbol={sym} /></p>{D(freeCredit).greaterThan(0) && <p className="text-xs text-muted-foreground">Unused credit {formatPrice(freeCredit.toString(), sym)}</p>}</Card>
          <Card className="p-4"><p className="text-[13px] text-muted-foreground">Total bought</p><p className="mt-1 text-2xl font-semibold"><Money value={stats._sum.total?.toString() ?? "0"} symbol={sym} /></p><p className="text-xs text-muted-foreground">{stats._count._all} sales · {formatQty(stats._sum.totalQuantity?.toString() ?? "0")} containers</p></Card>
          <Card className="p-4"><p className="text-[13px] text-muted-foreground">Open invoices</p><p className="mt-1 text-2xl font-semibold">{openCount}</p><p className="text-xs text-muted-foreground">Last sale {stats._max.invoiceDate ? formatDate(stats._max.invoiceDate) : "—"}</p></Card>
          <Card className="p-4"><p className="text-[13px] text-muted-foreground">Credit limit</p><p className="mt-1 text-2xl font-semibold">{c.creditLimit ? <Money value={c.creditLimit.toString()} symbol={sym} /> : "No limit"}</p><p className="text-xs text-muted-foreground">Customer since {formatDate(c.registeredOn)}</p></Card>
        </div>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {visibleTabs.map(t => (
          <Link key={t.key} href={`/customers/${c.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </div>

      {tab === "overview" && reminders.length > 0 && (
        <Card className="mb-4 border-warning/50 bg-warning/5"><CardContent className="grid gap-2 py-3 text-sm">
          {reminders.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Call about payment {formatDateTime(r.remindAt)}</span>
              {r.note && <span className="text-muted-foreground">“{r.note}”</span>}
              {r.callCount > 0 && <span className="text-xs text-muted-foreground">{r.callCount} calls · {r.outcome}</span>}
              {p.has("reminders.manage") && <CancelReminderButton id={r.id} />}
            </div>
          ))}
        </CardContent></Card>
      )}

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2"><CardHeader><CardTitle>Addresses</CardTitle></CardHeader><CardContent>
            <AddressManager customerId={c.id} locations={locations} canManage={p.has("customers.manage")}
              rows={c.addresses.map(a => ({ id: a.id, isPrimary: a.isPrimary, label: a.label, localName: a.localName, officialAddress: a.officialAddress ?? "", districtId: a.districtId ? String(a.districtId) : "", neighborhoodId: a.neighborhoodId ? String(a.neighborhoodId) : "", placeId: a.placeId ? String(a.placeId) : "", description: a.description ?? "", deliveryInstructions: a.deliveryInstructions ?? "", latitude: a.latitude?.toString() ?? "", longitude: a.longitude?.toString() ?? "", text: addressLine(a) }))} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent>
            <KV items={[["Customer no.", c.code], ["Type", label(c.customerType)], ["Price group", c.group?.name ?? "—"], ["Registered", formatDate(c.registeredOn)], ["Notes", c.notes ?? "—"]]} />
            {finance && <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-sm font-medium">Account corrections</p>
              <AccountActions customerId={c.id} balance={c.balance.toString()} freeCredit={freeCredit.toString()} hasOpen={openCount > 0} methods={methods.map(m => ({ id: m.id, name: m.name }))} symbol={sym}
                perms={{ adjust: p.has("ledger.adjust"), pay: p.has("payments.create") }}
                invoices={(await prisma.invoice.findMany({ where: { customerId: c.id, status: { not: "CANCELLED" } }, orderBy: { id: "desc" }, take: 30, select: { id: true, number: true } }))} />
            </div>}
          </CardContent></Card>
        </div>
      )}

      {tab === "prices" && <PricesTab customerId={c.id} canManage={p.has("pricing.manage")} sym={sym} today={today} />}
      {tab === "ledger" && finance && <LedgerTab customerId={c.id} sym={sym} />}
      {tab === "invoices" && finance && <InvoicesTab customerId={c.id} sym={sym} />}
      {tab === "payments" && finance && <PaymentsTab customerId={c.id} sym={sym} />}
      {tab === "deliveries" && finance && <DeliveriesTab customerId={c.id} />}
      {tab === "history" && finance && <HistoryTab customerId={c.id} sym={sym} />}
    </>
  );
}

async function PricesTab({ customerId, canManage, sym, today }: { customerId: number; canManage: boolean; sym: string; today: string }) {
  const rows = await customerPriceList(customerId, today);
  return (
    <Card><CardHeader><CardTitle>Prices for this customer</CardTitle></CardHeader><CardContent className="px-0">
      <PriceEditor customerId={customerId} canManage={canManage} symbol={sym} today={today} rows={rows} />
    </CardContent></Card>
  );
}

async function LedgerTab({ customerId, sym }: { customerId: number; sym: string }) {
  const rows = await prisma.ledgerEntry.findMany({ where: { customerId }, orderBy: { seq: "desc" }, take: 200, include: { createdBy: { select: { fullName: true } } } });
  if (!rows.length) return <Card><EmptyState icon={ScrollText} title="No transactions yet" /></Card>;
  return (
    <Card><Table>
      <THead><TR><TH>#</TH><TH>Date</TH><TH>Type</TH><TH>Reference</TH><TH>Description</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR></THead>
      <TBody>{rows.map(r => (
        <TR key={r.id.toString()}>
          <TD className="text-muted-foreground tabular">{r.seq}</TD><TD className="whitespace-nowrap">{formatDate(r.txDate)}</TD><TD>{LEDGER_TYPES[r.type as LedgerType]?.label ?? r.type}</TD>
          <TD>{r.invoiceId ? <Link className="text-primary hover:underline" href={`/invoices/${r.invoiceId}`}>{r.reference}</Link> : r.paymentId ? <Link className="text-primary hover:underline" href={`/payments/${r.paymentId}`}>{r.reference}</Link> : r.reference}</TD>
          <TD className="max-w-96"><span className="line-clamp-2">{r.description}</span><span className="text-xs text-muted-foreground">{r.createdBy.fullName} · {formatDateTime(r.createdAt)}</span></TD>
          <TD className="text-right">{D(r.debit).isZero() ? "" : <Money value={r.debit.toString()} symbol={sym} />}</TD>
          <TD className="text-right">{D(r.credit).isZero() ? "" : <Money value={r.credit.toString()} symbol={sym} />}</TD>
          <TD className="text-right"><Balance value={r.balanceAfter.toString()} symbol={sym} /></TD>
        </TR>
      ))}</TBody>
    </Table></Card>
  );
}

async function InvoicesTab({ customerId, sym }: { customerId: number; sym: string }) {
  const rows = await prisma.invoice.findMany({ where: { customerId }, orderBy: { id: "desc" }, take: 200 });
  if (!rows.length) return <Card><EmptyState icon={FileDown} title="No invoices yet" /></Card>;
  return (
    <Card><Table>
      <THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Kind</TH><TH className="text-right">Total</TH><TH className="text-right">Settled</TH><TH className="text-right">Outstanding</TH><TH>Status</TH></TR></THead>
      <TBody>{rows.map(i => (
        <TR key={i.id}><TD><Link className="font-medium text-primary hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></TD><TD>{formatDate(i.invoiceDate)}</TD><TD>{label(i.kind)}</TD>
          <TD className="text-right"><Money value={i.total.toString()} symbol={sym} /></TD><TD className="text-right"><Money value={i.amountSettled.toString()} symbol={sym} /></TD>
          <TD className="text-right">{i.status === "CANCELLED" ? "—" : <Money value={D(i.total).minus(i.amountSettled).toString()} symbol={sym} />}</TD><TD><StatusBadge status={displayStatus(i)} /></TD></TR>
      ))}</TBody>
    </Table></Card>
  );
}

async function PaymentsTab({ customerId, sym }: { customerId: number; sym: string }) {
  const rows = await prisma.payment.findMany({ where: { customerId }, orderBy: { id: "desc" }, take: 200, include: { method: true } });
  if (!rows.length) return <Card><EmptyState icon={Wallet} title="No payments yet" /></Card>;
  return (
    <Card><Table>
      <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Method</TH><TH>Reference</TH><TH className="text-right">Amount</TH><TH className="text-right">Unallocated</TH><TH>Status</TH></TR></THead>
      <TBody>{rows.map(r => (
        <TR key={r.id}><TD><Link className="font-medium text-primary hover:underline" href={`/payments/${r.id}`}>{r.number}</Link>{r.receivedAtSale && <p className="text-xs text-muted-foreground">at sale</p>}</TD><TD>{formatDate(r.paymentDate)}</TD><TD>{r.method.name}</TD><TD>{r.reference ?? "—"}</TD>
          <TD className="text-right"><Money value={r.amount.toString()} symbol={sym} /></TD><TD className="text-right">{r.status === "POSTED" ? <Money value={D(r.amount).minus(r.allocated).toString()} symbol={sym} /> : "—"}</TD><TD><StatusBadge status={r.status} /></TD></TR>
      ))}</TBody>
    </Table></Card>
  );
}

async function DeliveriesTab({ customerId }: { customerId: number }) {
  const rows = await prisma.delivery.findMany({ where: { customerId }, orderBy: { id: "desc" }, take: 100, include: { assignedTo: { select: { fullName: true } }, items: { include: { product: { select: { name: true } } } } } });
  if (!rows.length) return <Card><EmptyState icon={Truck} title="No deliveries yet" /></Card>;
  return (
    <Card><Table>
      <THead><TR><TH>Delivery</TH><TH>Date</TH><TH>Items</TH><TH>Driver</TH><TH>Status</TH></TR></THead>
      <TBody>{rows.map(d => (
        <TR key={d.id}><TD><Link className="font-medium text-primary hover:underline" href={`/deliveries/${d.id}`}>{d.number}</Link></TD><TD>{formatDate(d.scheduledDate)}</TD><TD>{d.items.map(i => `${formatQty(i.quantity.toString())} × ${i.product.name}`).join(", ")}</TD><TD>{d.assignedTo?.fullName ?? "—"}</TD><TD><StatusBadge status={d.status} /></TD></TR>
      ))}</TBody>
    </Table></Card>
  );
}

async function HistoryTab({ customerId, sym }: { customerId: number; sym: string }) {
  const rows = await customerPriceHistory(customerId);
  const products = await prisma.product.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, fullName: true } });
  if (!rows.length) return <Card><EmptyState icon={ScrollText} title="No price changes for this customer" /></Card>;
  return (
    <Card><Table>
      <THead><TR><TH>When</TH><TH>Product</TH><TH>Change</TH><TH>Effective</TH><TH>By</TH><TH>Reason</TH></TR></THead>
      <TBody>{rows.map(r => (
        <TR key={r.id}><TD className="whitespace-nowrap">{formatDateTime(r.changedAt)}</TD><TD>{products.find(x => x.id === r.productId)?.name}</TD>
          <TD className="tabular">{r.oldPrice ? formatPrice(r.oldPrice.toString(), sym) : "default"} → {r.newPrice ? formatPrice(r.newPrice.toString(), sym) : "default"} <Badge tone="outline">{label(r.action)}</Badge></TD>
          <TD className="whitespace-nowrap">{isoOf(r.effectiveFrom)}{r.effectiveTo ? ` → ${isoOf(r.effectiveTo)}` : ""}</TD><TD>{users.find(u => u.id === r.changedById)?.fullName ?? "—"}</TD><TD>{r.reason ?? "—"}</TD></TR>
      ))}</TBody>
    </Table></Card>
  );
}
