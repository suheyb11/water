import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listPayments } from "@/server/services/invoices";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { Money, PageHeader, Pager, StatusBadge, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PeriodPicker, SearchInput, SelectFilter } from "@/components/client-kit";
import { formatDate, presetRange } from "@/lib/dates";
import { D } from "@/lib/money";

export const metadata = { title: "Payments" };
const PAGE = 30;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("payments.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const [{ rows, total, sum }, s, methods] = await Promise.all([
    listPayments({ q: sp.q, methodId: sp.method ? (idOf(sp.method) ?? -1) : undefined, from: r.from, to: r.to, take: PAGE, skip: (page - 1) * PAGE }),
    getSettings(), listPaymentMethods(false),
  ]);
  const sym = s.currencySymbol;
  return (
    <>
      <PageHeader title="Payments" description={<>Received in the period (not reversed): <b><Money value={D(sum ?? 0).toString()} symbol={sym} /></b></>}
        actions={actor.permissions.has("payments.create") && <Button asChild><Link href="/payments/new"><Plus />Receive payment</Link></Button>} />
      <div className="mb-4"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3"><SearchInput placeholder="Receipt no., reference, customer" /><SelectFilter name="method" placeholder="All methods" options={methods.map(m => ({ value: String(m.id), label: m.name }))} /></div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Customer</TH><TH>Method</TH><TH>Reference</TH><TH className="text-right">Amount</TH><TH className="text-right">Applied</TH><TH className="text-right">Advance</TH><TH>Status</TH></TR></THead>
            <TBody>{rows.map(p => (
              <TR key={p.id} className={p.status === "REVERSED" ? "text-muted-foreground line-through" : ""}>
                <TD><Link href={`/payments/${p.id}`} className="font-medium text-primary hover:underline">{p.number}</Link>{p.receivedAtSale && <p className="text-xs text-muted-foreground no-underline">at sale</p>}</TD>
                <TD className="whitespace-nowrap">{formatDate(p.paymentDate)}</TD>
                <TD><Link href={`/customers/${p.customer.id}`} className="hover:underline">{p.customer.name}</Link></TD>
                <TD>{p.method.name}</TD><TD>{p.reference ?? "—"}</TD>
                <TD className="text-right"><Money value={p.amount.toString()} symbol={sym} /></TD>
                <TD className="text-right"><Money value={p.allocated.toString()} symbol={sym} /></TD>
                <TD className="text-right">{p.status === "POSTED" ? <Money value={D(p.amount).minus(p.allocated).toString()} symbol={sym} /> : "—"}</TD>
                <TD><StatusBadge status={p.status} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={Wallet} title="No payments in this period" />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/payments" />
      </Card>
    </>
  );
}
