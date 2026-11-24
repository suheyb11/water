"use client";
import * as React from "react";
import Link from "next/link";
import { Phone, PhoneCall, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { CallForm, CancelReminderButton, ReminderHistory } from "@/components/reminder-center";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { ReminderView } from "@/server/services/reminders";

export function ReminderTable({ rows, symbol, canManage, closed }: { rows: (ReminderView & { whenText: string; lastCallText: string | null })[]; symbol: string; canManage: boolean; closed?: boolean }) {
  const router = useRouter();
  const [logging, setLogging] = React.useState<number | null>(null);
  return (
    <Table>
      <THead><TR><TH>When</TH><TH>Customer</TH><TH>Note</TH><TH className="text-right">Owes now</TH><TH>Calls</TH>{closed ? <TH>Outcome</TH> : canManage && <TH />}</TR></THead>
      <TBody>{rows.map(r => (
        <React.Fragment key={r.id}>
          <TR>
            <TD className="whitespace-nowrap">{r.whenText}{!closed && new Date(r.remindAt) <= new Date() && <div><Badge tone="danger">due</Badge></div>}</TD>
            <TD><Link href={`/customers/${r.customer.id}`} className="font-medium hover:underline">{r.customer.name}</Link>
              <p className="text-xs"><a href={`tel:${r.customer.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="size-3" />{r.customer.phone}</a></p>
              {r.invoice && <p className="text-xs text-muted-foreground"><Link href={`/invoices/${r.invoice.id}`} className="hover:underline">{r.invoice.number}</Link></p>}</TD>
            <TD className="max-w-80"><span className="line-clamp-2">{r.note ?? "—"}</span>{r.expectedAmount && <p className="text-xs text-muted-foreground">promised {formatMoney(r.expectedAmount, symbol)}</p>}</TD>
            <TD className="text-right tabular">{Number(r.customer.balance) > 0 ? <b className="text-destructive">{formatMoney(r.customer.balance, symbol)}</b> : <span className="text-success">settled</span>}</TD>
            <TD className="text-sm">{r.callCount}{r.lastCallText && <p className="text-xs text-muted-foreground">last {r.lastCallText}</p>}<ReminderHistory id={r.id} /></TD>
            {closed ? <TD className="max-w-72 text-sm text-muted-foreground">{r.status === "CANCELLED" ? "Cancelled: " : ""}{r.outcome}</TD> : canManage && (
              <TD className="text-right"><div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => setLogging(logging === r.id ? null : r.id)}><PhoneCall />Log call</Button>
                <Button size="sm" variant="outline" asChild><Link href={`/payments/new?customer=${r.customer.id}${r.invoice ? `&invoice=${r.invoice.id}` : ""}`}><Wallet /></Link></Button>
                <CancelReminderButton id={r.id} />
              </div></TD>
            )}
          </TR>
          {logging === r.id && <TR><TD colSpan={6}><CallForm reminderId={r.id} onDone={() => { setLogging(null); router.refresh(); }} onCancel={() => setLogging(null)} /></TD></TR>}
        </React.Fragment>
      ))}</TBody>
    </Table>
  );
}
