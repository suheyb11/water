import Link from "next/link";
import { FileDown, ScrollText } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { customerStatement } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { Balance, Money, PageHeader, EmptyState, idOf } from "@/components/common";
import { DocumentHead } from "@/components/document-head";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PeriodPicker, PrintButton } from "@/components/client-kit";
import { addressFull, addressLine } from "@/lib/address";
import { formatDate, presetRange } from "@/lib/dates";
import { D } from "@/lib/money";
import { StatementCustomer } from "./statement-picker";

export const metadata = { title: "Customer statement" };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("ledger.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const id = sp.customer ? (idOf(sp.customer) ?? -1) : null;
  const [st, s] = await Promise.all([id ? customerStatement(id, r.from, r.to) : Promise.resolve(null), getSettings()]);
  const sym = s.currencySymbol;
  const pdf = st ? `/api/pdf/statement/${st.customer.id}?from=${r.from}&to=${r.to}` : "";
  return (
    <>
      <PageHeader title="Customer statement" description="Calculated from the ledger: opening balance, every debit and credit in the period, running balance, closing balance." />
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <StatementCustomer initial={st ? { id: st.customer.id, code: st.customer.code, name: st.customer.name, phone: st.customer.phone, balance: st.customer.balance.toString(), address: addressLine(st.customer.addresses[0]) } : null} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <PeriodPicker preset={r.preset} from={r.from} to={r.to} />
        {st && <div className="flex gap-2"><PrintButton /><Button variant="outline" asChild><a href={pdf} target="_blank" rel="noreferrer"><FileDown />PDF</a></Button><Button variant="outline" asChild><a href={`${pdf}&download=1`}>Download</a></Button></div>}
      </div>
      {!st ? <Card><EmptyState icon={ScrollText} title="Choose a customer">Search by name, phone, customer number or local address.</EmptyState></Card> : (
        <Card className="p-6 print:border-0 print:p-0">
          <DocumentHead s={s} title="Statement of account"><p className="mt-2 text-sm">{formatDate(r.from)} – {formatDate(r.to)}</p></DocumentHead>
          <div className="flex flex-wrap justify-between gap-6 py-5">
            <div className="text-sm"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
              <p className="text-base font-semibold"><Link href={`/customers/${st.customer.id}`} className="hover:underline">{st.customer.name}</Link> ({st.customer.code})</p><p>{st.customer.phone}</p><p className="max-w-md text-muted-foreground">{addressFull(st.customer.addresses[0])}</p></div>
            <div className="grid min-w-64 gap-1 rounded-xl bg-muted/60 p-4 text-sm">
              <Row k="Opening balance" v={<Money value={st.opening} symbol={sym} />} />
              <Row k="Debits (purchases, charges)" v={<Money value={st.totalDebit} symbol={sym} />} />
              <Row k="Credits (payments, returns)" v={<Money value={st.totalCredit} symbol={sym} />} />
              <div className="mt-1 border-t pt-1"><Row k={<b>Closing balance</b>} v={<Balance value={st.closing} symbol={sym} />} /></div>
            </div>
          </div>
          <Table>
            <THead><TR><TH>Date</TH><TH>Reference</TH><TH>Description</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></TR></THead>
            <TBody>
              <TR className="bg-muted/40"><TD>{formatDate(r.from)}</TD><TD /><TD className="font-medium">Opening balance</TD><TD /><TD /><TD className="text-right font-medium"><Money value={st.opening} symbol={sym} /></TD></TR>
              {st.rows.map(e => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDate(e.date)}</TD>
                  <TD>{e.invoiceId ? <Link href={`/invoices/${e.invoiceId}`} className="text-primary hover:underline">{e.reference}</Link> : e.paymentId ? <Link href={`/payments/${e.paymentId}`} className="text-primary hover:underline">{e.reference}</Link> : e.reference}</TD>
                  <TD><span className="font-medium">{e.typeLabel}</span><p className="text-xs text-muted-foreground">{e.description}</p></TD>
                  <TD className="text-right">{D(e.debit).isZero() ? "" : <Money value={e.debit} symbol={sym} />}</TD>
                  <TD className="text-right">{D(e.credit).isZero() ? "" : <Money value={e.credit} symbol={sym} />}</TD>
                  <TD className="text-right"><Money value={e.balance} symbol={sym} /></TD>
                </TR>
              ))}
              <TR className="bg-muted/40 font-semibold"><TD colSpan={3}>Closing balance {formatDate(r.to)}</TD><TD className="text-right"><Money value={st.totalDebit} symbol={sym} /></TD><TD className="text-right"><Money value={st.totalCredit} symbol={sym} /></TD><TD className="text-right"><Money value={st.closing} symbol={sym} /></TD></TR>
            </TBody>
          </Table>
          <p className="mt-4 text-xs text-muted-foreground">Positive balance = amount owed to {s.companyName}. Negative balance = advance credit held for the customer.</p>
        </Card>
      )}
    </>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
