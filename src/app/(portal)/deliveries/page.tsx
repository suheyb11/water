import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listDeliveries } from "@/server/services/deliveries";
import { listDeliveryStaff } from "@/server/services/users";
import { PageHeader, Pager, StatusBadge, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SearchInput, SelectFilter } from "@/components/client-kit";
import { formatDate, isIsoDate, todayIso } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { DELIVERY_STATUSES, label } from "@/lib/constants";

export const metadata = { title: "Deliveries" };
const PAGE = 30;

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("deliveries.view", "deliveries.update", "deliveries.manage");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const seeAll = actor.permissions.has("deliveries.view") || actor.permissions.has("deliveries.manage");
  const date = sp.date === "all" ? undefined : isIsoDate(sp.date) ? sp.date : sp.status || sp.q ? undefined : todayIso();
  const [{ rows, total }, drivers] = await Promise.all([
    listDeliveries({ status: sp.status, date, q: sp.q, assignedToId: seeAll ? (sp.driver ? (idOf(sp.driver) ?? -1) : undefined) : actor.userId, take: PAGE, skip: (page - 1) * PAGE }),
    seeAll ? listDeliveryStaff() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={seeAll ? "Deliveries" : "My deliveries"} description={date ? `Scheduled for ${formatDate(date)}.` : "All dates."}
        actions={actor.permissions.has("deliveries.manage") && <Button asChild><Link href="/deliveries/new"><Plus />New delivery order</Link></Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <SearchInput placeholder="Delivery no., customer, place" />
          <SelectFilter name="status" placeholder="Any status" options={DELIVERY_STATUSES.map(s => ({ value: s, label: label(s) }))} />
          <SelectFilter name="date" placeholder="Today" options={[{ value: "all", label: "All dates" }]} />
          {seeAll && drivers.length > 0 && <SelectFilter name="driver" placeholder="All drivers" options={drivers.map(d => ({ value: String(d.id), label: d.fullName }))} />}
        </div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Delivery</TH><TH>Date</TH><TH>Customer</TH><TH>Address</TH><TH>Items</TH><TH>Driver</TH><TH>Invoice</TH><TH>Status</TH></TR></THead>
            <TBody>{rows.map(d => (
              <TR key={d.id}>
                <TD><Link href={`/deliveries/${d.id}`} className="font-medium text-primary hover:underline">{d.number}</Link></TD>
                <TD className="whitespace-nowrap">{formatDate(d.scheduledDate)}</TD>
                <TD>{d.customer.name}<p className="text-xs text-muted-foreground">{d.customer.phone}</p></TD>
                <TD className="max-w-72"><span className="line-clamp-2 text-sm">{d.addressText ?? "—"}</span></TD>
                <TD>{d.items.map(i => `${formatQty(i.quantity.toString())} × ${i.product.name}`).join(", ")}</TD>
                <TD>{d.assignedTo?.fullName ?? "—"}</TD>
                <TD>{d.invoice ? <Link href={`/invoices/${d.invoice.id}`} className="text-primary hover:underline">{d.invoice.number}</Link> : <span className="text-muted-foreground">on delivery</span>}</TD>
                <TD><StatusBadge status={d.status} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={Truck} title="No deliveries" />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/deliveries" />
      </Card>
    </>
  );
}
