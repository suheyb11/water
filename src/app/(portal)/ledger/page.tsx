import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { ledgerJournal } from "@/server/services/reports";
import { getSettings } from "@/server/services/settings";
import { Balance, Money, PageHeader, Pager, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PeriodPicker, SelectFilter } from "@/components/client-kit";
import { formatDate, formatDateTime, presetRange } from "@/lib/dates";
import { D } from "@/lib/money";
import { LEDGER_TYPES, type LedgerType } from "@/lib/constants";
import { StatementCustomer } from "../statements/statement-picker";
import { prisma } from "@/server/db";
import { addressLine } from "@/lib/address";

export const metadata = { title: "Customer ledger" };
const PAGE = 50;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("ledger.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const page = pageOf(sp.page);
  const customerId = sp.customer ? (idOf(sp.customer) ?? -1) : undefined;
  const [j, s, c] = await Promise.all([
    ledgerJournal({ customerId, from: r.from, to: r.to, type: sp.type, take: PAGE, skip: (page - 1) * PAGE }),
    getSettings(),
    customerId ? prisma.customer.findUnique({ where: { id: customerId }, include: { addresses: { where: { isPrimary: true }, include: { district: true, neighborhood: true, place: true } } } }) : Promise.resolve(null),
  ]);
  const sym = s.currencySymbol;
  return (
    <>
      <PageHeader title="Customer ledger" description={<>Append-only journal of every debit and credit. Corrections appear as their own entries. Period: debits <b><Money value={j.debit.toString()} symbol={sym} /></b>, credits <b><Money value={j.credit.toString()} symbol={sym} /></b>.</>} />
      <div className="mb-3 flex flex-wrap gap-3">
        <StatementCustomer initial={c ? { id: c.id, code: c.code, name: c.name, phone: c.phone, balance: c.balance.toString(), address: addressLine(c.addresses[0]) } : null} />
        <SelectFilter name="type" placeholder="All entry types" options={Object.entries(LEDGER_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
      </div>
      <div className="mb-4"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>
      <Card>
        {j.rows.length ? (
          <Table>
            <THead><TR><TH>Date</TH><TH>Customer</TH><TH>Type</TH><TH>Reference</TH><TH>Description</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance after</TH></TR></THead>
            <TBody>{j.rows.map(e => (
              <TR key={e.id.toString()}>
                <TD className="whitespace-nowrap">{formatDate(e.txDate)}<p className="text-xs text-muted-foreground">#{e.seq}</p></TD>
                <TD><Link href={`/customers/${e.customer.id}?tab=ledger`} className="hover:underline">{e.customer.name}</Link><p className="text-xs text-muted-foreground">{e.customer.code}</p></TD>
                <TD>{LEDGER_TYPES[e.type as LedgerType]?.label ?? e.type}</TD>
                <TD>{e.invoiceId ? <Link className="text-primary hover:underline" href={`/invoices/${e.invoiceId}`}>{e.reference}</Link> : e.paymentId ? <Link className="text-primary hover:underline" href={`/payments/${e.paymentId}`}>{e.reference}</Link> : e.reference}</TD>
                <TD className="max-w-96"><span className="line-clamp-2">{e.description}</span><span className="text-xs text-muted-foreground">{e.createdBy.fullName} · {formatDateTime(e.createdAt)}</span></TD>
                <TD className="text-right">{D(e.debit).isZero() ? "" : <Money value={e.debit.toString()} symbol={sym} />}</TD>
                <TD className="text-right">{D(e.credit).isZero() ? "" : <Money value={e.credit.toString()} symbol={sym} />}</TD>
                <TD className="text-right"><Balance value={e.balanceAfter.toString()} symbol={sym} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={BookOpen} title="No ledger entries in this period" />}
        <Pager total={j.total} page={page} pageSize={PAGE} params={sp} basePath="/ledger" />
      </Card>
    </>
  );
}
