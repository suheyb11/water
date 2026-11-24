"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { CustomerPicker, newKey, useAction, type PickedCustomer } from "@/components/client-kit";
import { openInvoicesAction } from "@/app/actions/lookup";
import { recordPaymentAction } from "@/app/actions/mutations";
import { D, formatMoney, money, sum } from "@/lib/money";
import { label } from "@/lib/constants";

type Open = Awaited<ReturnType<typeof openInvoicesAction>>[number];

export function PaymentForm({ methods, initialCustomer, focusInvoiceId, symbol, today, canBackdate }: { methods: { id: number; name: string }[]; initialCustomer: PickedCustomer | null; focusInvoiceId?: number; symbol: string; today: string; canBackdate: boolean }) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<PickedCustomer | null>(initialCustomer);
  const [open, setOpen] = React.useState<Open[]>([]);
  const [amount, setAmount] = React.useState("");
  const [methodId, setMethodId] = React.useState(methods[0] ? String(methods[0].id) : "");
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [manual, setManual] = React.useState(false);
  const [alloc, setAlloc] = React.useState<Record<number, string>>({});
  const [keepAdvance, setKeepAdvance] = React.useState(false);
  const [key, setKey] = React.useState(newKey);
  const [done, setDone] = React.useState<{ id: number; number: string } | null>(null);

  React.useEffect(() => {
    if (!customer) { setOpen([]); return; }
    openInvoicesAction(customer.id).then(rows => {
      setOpen(rows);
      if (focusInvoiceId && rows.some(r => r.id === focusInvoiceId)) {
        const r = rows.find(x => x.id === focusInvoiceId)!;
        setManual(true); setAlloc({ [r.id]: r.outstanding }); setAmount(r.outstanding);
      }
    });
  }, [customer, focusInvoiceId]);

  const owed = money(sum(open.map(o => o.outstanding)));
  const amt = D(amount || 0);
  const allocated = manual ? money(sum(Object.values(alloc).map(v => v || "0"))) : (amt.lessThan(owed) ? amt : owed);
  const advance = money(amt.minus(allocated));
  const autoPreview = (() => {
    let left = amt; const out: Record<number, string> = {};
    for (const o of open) { if (left.lte(0)) break; const t = left.lessThan(o.outstanding) ? left : D(o.outstanding); out[o.id] = t.toFixed(2); left = left.minus(t); }
    return out;
  })();

  const save = useAction(recordPaymentAction, { onSuccess: d => { setDone(d); router.refresh(); } });
  const submit = () => save.run({
    customerId: customer?.id ?? 0, amount, methodId: Number(methodId), paymentDate: date, reference: reference || null, notes: notes || null,
    allocations: manual ? Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ invoiceId: Number(id), amount: v })) : [],
    autoAllocate: manual ? !keepAdvance : true, idempotencyKey: key,
  });

  if (done) return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <CheckCircle2 className="mx-auto size-12 text-success" />
      <h2 className="mt-3 text-xl font-semibold">Receipt {done.number} recorded</h2>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline"><Link href={`/payments/${done.id}`}>Open receipt</Link></Button>
        <Button asChild variant="outline"><a href={`/api/pdf/receipt/${done.id}`} target="_blank" rel="noreferrer"><FileDown />Print receipt</a></Button>
        <Button onClick={() => { setDone(null); setAmount(""); setReference(""); setNotes(""); setAlloc({}); setManual(false); setKey(newKey()); setCustomer(null); }}>Next payment</Button>
      </div>
    </Card>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-5">
        <Card><CardContent className="grid gap-4 pt-5">
          <CustomerPicker value={customer} onChange={c => { setCustomer(c); setAlloc({}); }} autoFocus={!customer} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={`Amount received (${symbol}) *`} error={save.errors.amount}><Input inputMode="decimal" className="h-10 text-lg tabular" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Method"><select className="h-9 w-full rounded-md border bg-card px-2 text-sm" value={methodId} onChange={e => setMethodId(e.target.value)}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Reference / transaction ID"><Input value={reference} onChange={e => setReference(e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={date} max={today} disabled={!canBackdate} onChange={e => setDate(e.target.value || today)} /></Field>
          </div>
          <Field label="Notes"><Input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </CardContent></Card>

        {customer && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Open invoices ({open.length}) — {formatMoney(owed.toString(), symbol)} owed</CardTitle>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={manual} onCheckedChange={c => { setManual(!!c); setAlloc({}); }} />Choose invoices myself</label>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {open.length ? (
                <Table>
                  <THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Kind</TH><TH className="text-right">Outstanding</TH><TH className="text-right">Apply</TH></TR></THead>
                  <TBody>{open.map(o => (
                    <TR key={o.id}>
                      <TD className="font-medium">{o.number}</TD><TD>{o.date}</TD><TD>{label(o.kind)}</TD><TD className="text-right tabular">{formatMoney(o.outstanding, symbol)}</TD>
                      <TD className="text-right">{manual
                        ? <Input className="ml-auto h-8 w-28 text-right" inputMode="decimal" value={alloc[o.id] ?? ""} onChange={e => setAlloc(a => ({ ...a, [o.id]: e.target.value }))} placeholder="0.00" aria-label={`Apply to ${o.number}`} />
                        : <span className="tabular text-muted-foreground">{autoPreview[o.id] ? formatMoney(autoPreview[o.id], symbol) : "—"}</span>}</TD>
                    </TR>
                  ))}</TBody>
                </Table>
              ) : <p className="px-5 pb-3 text-sm text-muted-foreground">No open invoices. The whole payment is kept as advance credit and used on the next purchase.</p>}
              {manual && <label className="mx-5 mt-3 flex items-center gap-2 text-sm"><Checkbox checked={keepAdvance} onCheckedChange={c => setKeepAdvance(!!c)} />Keep the rest as advance (do not apply it to other invoices)</label>}
            </CardContent>
          </Card>
        )}
      </div>
      <Card className="h-fit xl:sticky xl:top-20">
        <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />Summary</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Row k="Received" v={formatMoney(amt.toString(), symbol)} />
          <Row k={manual ? "Applied to chosen invoices" : "Applied to oldest invoices"} v={formatMoney(allocated.toString(), symbol)} />
          {manual && !keepAdvance && amt.greaterThan(allocated) && <Row k="Rest → other open invoices / advance" v={formatMoney(amt.minus(allocated).toString(), symbol)} />}
          {(!manual || keepAdvance) && advance.greaterThan(0) && <Row k="Kept as advance credit" v={<b className="text-success">{formatMoney(advance.toString(), symbol)}</b>} />}
          {customer && <Row k="Balance after" v={formatMoney(D(customer.balance).minus(amt).toString(), symbol)} />}
          {save.error && <Alert tone="danger" title={save.error} />}
          <Button className="mt-2 h-11" disabled={!customer || !amt.greaterThan(0)} loading={save.busy} onClick={submit}>Record payment</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
