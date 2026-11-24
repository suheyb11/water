import Link from "next/link";
import { FileText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listInvoices } from "@/server/services/invoices";
import { getSettings } from "@/server/services/settings";
import { displayStatus } from "@/server/services/sales";
import { Money, PageHeader, Pager, StatusBadge, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PeriodPicker, SearchInput, SelectFilter } from "@/components/client-kit";
import { formatDate, presetRange } from "@/lib/dates";
import { D } from "@/lib/money";
import { label } from "@/lib/constants";

export const metadata = { title: "Invoices" };
const PAGE = 30;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("invoices.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const r = sp.period || sp.from ? presetRange(sp.period, sp.from, sp.to) : null;
  const [{ rows, total, sumTotal, sumSettled }, s] = await Promise.all([
    listInvoices({ q: sp.q, status: sp.status, kind: sp.kind, customerId: sp.customer ? (idOf(sp.customer) ?? -1) : undefined, from: r?.from, to: r?.to, take: PAGE, skip: (page - 1) * PAGE }),
    getSettings(),
  ]);
  const sym = s.currencySymbol;
  return (
    <>
      <PageHeader title="Invoices" description={<>Posted invoices keep their prices for ever. Corrections are separate documents. Total {sym}{D(sumTotal ?? 0).toFixed(2)}, outstanding {sym}{D(sumTotal ?? 0).minus(D(sumSettled ?? 0)).toFixed(2)} (excluding cancelled).</>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput placeholder="Invoice no., customer, phone" />
          <SelectFilter name="status" placeholder="Any status" options={[{ value: "OPEN", label: "Open (unpaid + partial)" }, { value: "UNPAID", label: "Unpaid" }, { value: "PARTIALLY_PAID", label: "Partially paid" }, { value: "PAID", label: "Paid" }, { value: "OVERDUE", label: "Overdue" }, { value: "CANCELLED", label: "Cancelled" }]} />
          <SelectFilter name="kind" placeholder="All kinds" options={["SALE", "DEBIT_NOTE", "OPENING_BALANCE", "REFUND"].map(k => ({ value: k, label: label(k) }))} />
        </div>
        <div className="border-b p-3"><PeriodPicker preset={r?.preset ?? ""} from={r?.from ?? ""} to={r?.to ?? ""} /></div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Due</TH><TH>Customer</TH><TH>Kind</TH><TH className="text-right">Total</TH><TH className="text-right">Paid</TH><TH className="text-right">Outstanding</TH><TH>Status</TH></TR></THead>
            <TBody>{rows.map(i => (
              <TR key={i.id}>
                <TD><Link href={`/invoices/${i.id}`} className="font-medium text-primary hover:underline">{i.number}</Link></TD>
                <TD className="whitespace-nowrap">{formatDate(i.invoiceDate)}</TD>
                <TD className="whitespace-nowrap text-muted-foreground">{formatDate(i.dueDate)}</TD>
                <TD><Link href={`/customers/${i.customerId}`} className="hover:underline">{i.customerName}</Link><p className="text-xs text-muted-foreground">{i.customerPhone}</p></TD>
                <TD>{label(i.kind)}</TD>
                <TD className="text-right"><Money value={i.total.toString()} symbol={sym} /></TD>
                <TD className="text-right"><Money value={i.amountSettled.toString()} symbol={sym} /></TD>
                <TD className="text-right">{i.status === "CANCELLED" ? "—" : <Money value={D(i.total).minus(i.amountSettled).toString()} symbol={sym} />}</TD>
                <TD><StatusBadge status={displayStatus(i)} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={FileText} title="No invoices found" />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/invoices" />
      </Card>
    </>
  );
}
