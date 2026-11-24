import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth/session";
import { getInvoice } from "@/server/services/invoices";
import { getSettings } from "@/server/services/settings";
import { displayStatus } from "@/server/services/sales";
import { Money, PageHeader, StatusBadge, idOf } from "@/components/common";
import { DocumentHead } from "@/components/document-head";
import { Alert, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/dates";
import { D, formatPrice, formatQty } from "@/lib/money";
import { PRICE_SOURCES, label, type PriceSource } from "@/lib/constants";
import { InvoiceActions } from "./invoice-actions";
import { NewReminderButton } from "@/components/reminder-center";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("invoices.view");
  const inv = await getInvoice((idOf((await params).id) ?? -1));
  if (!inv) notFound();
  const s = await getSettings();
  const sym = s.currencySymbol;
  const outstanding = inv.status === "CANCELLED" ? D(0) : D(inv.total).minus(inv.amountSettled);
  const status = displayStatus(inv);
  const title = inv.kind === "SALE" ? "Invoice" : inv.kind === "DEBIT_NOTE" ? "Debit note" : inv.kind === "REFUND" ? "Refund" : "Opening balance";
  return (
    <>
      <PageHeader title={`${title} ${inv.number}`} description={<span className="flex items-center gap-2"><StatusBadge status={status} /> Posted by {inv.createdBy.fullName} · {formatDateTime(inv.createdAt)}</span>}
        actions={<InvoiceActions invoice={{ id: inv.id, number: inv.number, customerId: inv.customerId, kind: inv.kind, status: inv.status, outstanding: outstanding.toFixed(2) }}
          items={inv.items.map(i => ({ id: i.id, name: i.productName, quantity: i.quantity.toString(), returned: i.quantityReturned.toString(), unitPrice: i.unitPrice.toString() }))}
          perms={{ pay: actor.permissions.has("payments.create"), cancel: actor.permissions.has("invoices.cancel"), adjust: actor.permissions.has("ledger.adjust") }} symbol={sym} />} />

      {actor.permissions.has("reminders.manage") && inv.status !== "CANCELLED" && outstanding.greaterThan(0) && <div className="-mt-3 mb-4 flex justify-end print:hidden"><NewReminderButton customerId={inv.customerId} invoiceId={inv.id} label="Remind me to call about this invoice" /></div>}
      {inv.status === "CANCELLED" && <Alert tone="warning" className="mb-4 print:hidden" title={`Cancelled ${inv.cancelledAt ? formatDateTime(inv.cancelledAt) : ""}`}>{inv.cancelReason}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card className="p-6 print:border-0 print:p-0">
          <DocumentHead s={s} title={title} number={inv.number}>
            <div className="mt-2 text-sm"><p>Date: <b>{formatDate(inv.invoiceDate)}</b></p>{inv.dueDate && inv.kind === "SALE" && <p>Due: {formatDate(inv.dueDate)}</p>}<p className="mt-1"><StatusBadge status={status} /></p></div>
          </DocumentHead>
          <div className="grid gap-1 py-5 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill to</p>
            <p className="text-base font-semibold"><Link href={`/customers/${inv.customerId}`} className="hover:underline">{inv.customerName}</Link> <span className="font-normal text-muted-foreground">({inv.customer.code})</span></p>
            {inv.customerPhone && <p>{inv.customerPhone}</p>}
            {inv.addressText && <p className="text-muted-foreground">{inv.addressText}</p>}
          </div>
          {inv.items.length > 0 ? (
            <Table>
              <THead><TR><TH>#</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Unit price</TH><TH className="text-right">Line total</TH></TR></THead>
              <TBody>{inv.items.map(i => (
                <TR key={i.id}>
                  <TD className="text-muted-foreground">{i.lineNo}</TD>
                  <TD><p className="font-medium">{i.productName}</p><p className="text-xs text-muted-foreground">{Number(i.capacity)} {i.capacityUnit} · {i.productCode}{D(i.quantityReturned).greaterThan(0) ? ` · ${formatQty(i.quantityReturned.toString())} returned` : ""}</p>
                    <p className="text-xs text-muted-foreground print:hidden">{PRICE_SOURCES[i.priceSource as PriceSource] ?? i.priceSource}{i.priceSource === "OVERRIDE" ? ` (list ${formatPrice(i.resolvedPrice.toString(), sym)}: ${i.overrideReason})` : ""}</p></TD>
                  <TD className="text-right tabular">{formatQty(i.quantity.toString())} <span className="text-xs text-muted-foreground">{i.saleUnit}</span></TD>
                  <TD className="text-right tabular">{formatPrice(i.unitPrice.toString(), sym)}</TD>
                  <TD className="text-right"><Money value={i.lineTotal.toString()} symbol={sym} /></TD>
                </TR>
              ))}</TBody>
            </Table>
          ) : <p className="rounded-lg border p-4 text-sm">{inv.notes}</p>}
          <div className="ml-auto mt-4 grid w-full max-w-xs gap-1.5 text-sm">
            {inv.items.length > 0 && <Line k="Subtotal" v={<Money value={inv.subtotal.toString()} symbol={sym} />} />}
            {D(inv.discount).greaterThan(0) && <Line k="Discount" v={<>−<Money value={inv.discount.toString()} symbol={sym} /></>} />}
            {D(inv.charges).greaterThan(0) && <Line k="Additional charges" v={<Money value={inv.charges.toString()} symbol={sym} />} />}
            <Line k={<b>Grand total</b>} v={<b className="text-lg"><Money value={inv.total.toString()} symbol={sym} /></b>} />
            <Line k="Paid / settled" v={<Money value={inv.amountSettled.toString()} symbol={sym} />} />
            <Line k={<b>Outstanding</b>} v={<b className={outstanding.greaterThan(0) ? "text-destructive" : ""}><Money value={outstanding.toString()} symbol={sym} /></b>} />
          </div>
          {inv.items.length > 0 && inv.notes && <p className="mt-6 whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p>}
          {s.invoiceFooter && <p className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">{s.invoiceFooter}</p>}
        </Card>

        <div className="grid content-start gap-4 print:hidden">
          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent className="px-0 pb-2">
              {inv.allocations.length ? (
                <Table><TBody>{inv.allocations.map(a => (
                  <TR key={a.id} className={a.reversedAt ? "text-muted-foreground line-through" : ""}>
                    <TD>{a.payment ? <Link href={`/payments/${a.payment.id}`} className="text-primary hover:underline">{a.payment.number}</Link> : a.creditNote?.number}
                      <p className="text-xs text-muted-foreground">{formatDate(a.allocatedOn)} · {a.payment ? a.payment.method.name : label(a.creditNote?.kind)}{a.reversedAt ? ` · reversed: ${a.reverseReason}` : ""}</p></TD>
                    <TD className="text-right"><Money value={a.amount.toString()} symbol={sym} /></TD>
                  </TR>
                ))}</TBody></Table>
              ) : <p className="px-5 pb-3 text-sm text-muted-foreground">Nothing paid yet.</p>}
            </CardContent>
          </Card>
          {(inv.creditNotes.length > 0 || inv.relatedDocs.length > 0 || inv.relatedInvoice || inv.delivery) && (
            <Card><CardHeader><CardTitle>Related documents</CardTitle></CardHeader><CardContent className="grid gap-1.5 text-sm">
              {inv.relatedInvoice && <p>Adjusts <Link className="text-primary hover:underline" href={`/invoices/${inv.relatedInvoice.id}`}>{inv.relatedInvoice.number}</Link></p>}
              {inv.relatedDocs.map(d => <p key={d.id}>{label(d.kind)} <Link className="text-primary hover:underline" href={`/invoices/${d.id}`}>{d.number}</Link> (<Money value={d.total.toString()} symbol={sym} />)</p>)}
              {inv.creditNotes.map(c => <p key={c.id}>{label(c.kind)} {c.number}: <Money value={c.amount.toString()} symbol={sym} /> — {c.reason}</p>)}
              {inv.delivery && <p>Delivery <Link className="text-primary hover:underline" href={`/deliveries/${inv.delivery.id}`}>{inv.delivery.number}</Link> <StatusBadge status={inv.delivery.status} /></p>}
            </CardContent></Card>
          )}
        </div>
      </div>
    </>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
