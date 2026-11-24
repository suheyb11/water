import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth/session";
import { getPayment } from "@/server/services/payments";
import { getSettings } from "@/server/services/settings";
import { KV, Money, PageHeader, StatusBadge, idOf } from "@/components/common";
import { DocumentHead } from "@/components/document-head";
import { Alert, Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { addressLine } from "@/lib/address";
import { formatDate, formatDateTime } from "@/lib/dates";
import { D } from "@/lib/money";
import { label } from "@/lib/constants";
import { PaymentActions } from "./reverse-button";

export const metadata = { title: "Receipt" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("payments.view");
  const p = await getPayment((idOf((await params).id) ?? -1));
  if (!p) notFound();
  const s = await getSettings();
  const sym = s.currencySymbol;
  const active = p.allocations.filter(a => !a.reversedAt);
  const free = p.status === "POSTED" ? D(p.amount).minus(p.allocated) : D(0);
  return (
    <>
      <PageHeader title={`Receipt ${p.number}`} description={<span className="flex items-center gap-2"><StatusBadge status={p.status} />Recorded by {p.createdBy.fullName} · {formatDateTime(p.createdAt)}</span>}
        actions={<PaymentActions id={p.id} number={p.number} canReverse={p.status === "POSTED" && actor.permissions.has("payments.reverse")} />} />
      {p.status === "REVERSED" && <Alert tone="warning" className="mb-4" title={`Reversed ${p.reversedAt ? formatDateTime(p.reversedAt) : ""}`}>{p.reverseReason}</Alert>}
      <Card className="mx-auto max-w-3xl p-6 print:border-0 print:p-0">
        <DocumentHead s={s} title="Payment receipt" number={p.number}><p className="mt-2 text-sm">Date: <b>{formatDate(p.paymentDate)}</b></p></DocumentHead>
        <div className="grid gap-6 py-5 sm:grid-cols-2">
          <div className="text-sm"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Received from</p>
            <p className="text-base font-semibold"><Link href={`/customers/${p.customer.id}`} className="hover:underline">{p.customer.name}</Link> ({p.customer.code})</p><p>{p.customer.phone}</p><p className="text-muted-foreground">{addressLine(p.customer.addresses[0])}</p></div>
          <div className="rounded-xl bg-primary/8 p-4 text-right"><p className="text-sm text-muted-foreground">Amount received</p><p className="text-3xl font-semibold"><Money value={p.amount.toString()} symbol={sym} /></p><p className="text-sm">{p.method.name}{p.reference ? ` · ref ${p.reference}` : ""}</p></div>
        </div>
        <Table>
          <THead><TR><TH>Applied to</TH><TH>Kind</TH><TH>Date</TH><TH className="text-right">Amount</TH></TR></THead>
          <TBody>
            {p.allocations.map(a => (
              <TR key={a.id} className={a.reversedAt ? "text-muted-foreground line-through" : ""}><TD><Link href={`/invoices/${a.invoice.id}`} className="text-primary hover:underline">{a.invoice.number}</Link></TD><TD>{label(a.invoice.kind)}</TD><TD>{formatDate(a.allocatedOn)}</TD><TD className="text-right"><Money value={a.amount.toString()} symbol={sym} /></TD></TR>
            ))}
            {free.greaterThan(0) && <TR><TD colSpan={3}>Advance credit (not yet used)</TD><TD className="text-right"><Money value={free.toString()} symbol={sym} /></TD></TR>}
            {!p.allocations.length && free.isZero() && <TR><TD colSpan={4} className="text-muted-foreground">—</TD></TR>}
          </TBody>
        </Table>
        <KV className="mt-5" items={[["Applied", <Money key="a" value={active.reduce((x, a) => x.plus(a.amount), D(0)).toString()} symbol={sym} />], ["Advance at receipt", <Money key="b" value={p.advanceAtReceipt.toString()} symbol={sym} />], ["Notes", p.notes ?? "—"]]} />
        {s.invoiceFooter && <p className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">{s.invoiceFooter}</p>}
      </Card>
    </>
  );
}
