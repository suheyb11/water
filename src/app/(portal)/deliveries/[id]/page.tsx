import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { getDelivery } from "@/server/services/deliveries";
import { listDeliveryStaff } from "@/server/services/users";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { KV, Money, PageHeader, StatusBadge, idOf } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { label, type DeliveryStatus } from "@/lib/constants";
import { DeliveryActions } from "../delivery-tools";

export const metadata = { title: "Delivery" };

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("deliveries.view", "deliveries.update", "deliveries.manage");
  const d = await getDelivery((idOf((await params).id) ?? -1));
  if (!d) notFound();
  const manager = actor.permissions.has("deliveries.manage");
  if (!manager && !actor.permissions.has("deliveries.view") && d.assignedToId !== actor.userId) redirect("/unauthorized");
  const [drivers, methods, s] = await Promise.all([manager ? listDeliveryStaff() : Promise.resolve([]), listPaymentMethods(), getSettings()]);
  const a = d.address;
  return (
    <>
      <PageHeader title={`Delivery ${d.number}`} description={<span className="flex items-center gap-2"><StatusBadge status={d.status} />Scheduled {formatDate(d.scheduledDate)}</span>}
        actions={<DeliveryActions id={d.id} status={d.status as DeliveryStatus} invoiced={!!d.invoiceId} isManager={manager} isMine={d.assignedToId === actor.userId} drivers={drivers} methods={methods.map(m => ({ id: m.id, name: m.name }))} symbol={s.currencySymbol} />} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Where</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-lg font-semibold">{d.customer.name}</p>
            <a href={`tel:${d.customer.phone}`} className="inline-flex items-center gap-2 text-primary"><Phone className="size-4" />{d.customer.phone}{d.customer.altPhone ? ` / ${d.customer.altPhone}` : ""}</a>
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" />{d.addressText ?? "—"}</p>
            {a?.latitude && a.longitude && <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=18/${a.latitude}/${a.longitude}`}>Open GPS location</a>}
            {d.notes && <p className="rounded-md bg-muted p-2">{d.notes}</p>}
          </CardContent>
          <CardContent className="px-0 pt-0">
            <Table><THead><TR><TH>Product</TH><TH className="text-right">Quantity</TH></TR></THead>
              <TBody>{d.items.map(i => <TR key={i.id}><TD>{i.product.name} <span className="text-muted-foreground">{Number(i.product.capacity)} {i.product.capacityUnit}</span></TD><TD className="text-right tabular">{formatQty(i.quantity.toString())} {i.product.saleUnit}</TD></TR>)}</TBody></Table>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent>
            <KV items={[["Driver", d.assignedTo?.fullName ?? "Not assigned"], ["Invoice", d.invoice ? <Link key="i" href={`/invoices/${d.invoice.id}`} className="text-primary hover:underline">{d.invoice.number} (<Money value={d.invoice.total.toString()} symbol={s.currencySymbol} />)</Link> : "Posted when delivered"], ["Delivered", d.deliveredAt ? formatDateTime(d.deliveredAt) : "—"], ["Received by", d.receivedBy ?? "—"], ["Failure", d.failureReason ?? "—"]]} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>History</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
            {d.events.map(e => <div key={e.id} className="border-l-2 border-primary/40 pl-3"><p className="font-medium">{e.fromStatus ? `${label(e.fromStatus)} → ` : ""}{label(e.toStatus)}</p><p className="text-xs text-muted-foreground">{formatDateTime(e.at)}{e.note ? ` · ${e.note}` : ""}</p></div>)}
          </CardContent></Card>
        </div>
      </div>
    </>
  );
}
