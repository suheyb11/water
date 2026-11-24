"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Droplets, FileDown, Loader2, Minus, PencilLine, Plus, Printer, ShoppingCart, Trash2, Truck, UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Separator } from "@/components/ui/primitives";
import { CustomerPicker, newKey, useAction, type PickedCustomer } from "@/components/client-kit";
import { quoteAction } from "@/app/actions/lookup";
import { postSaleAction } from "@/app/actions/mutations";
import { D, formatMoney, formatPrice, money } from "@/lib/money";
import { PRICE_SOURCES, type PriceSource } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { localIn, tomorrowAt } from "@/components/reminder-center";

interface Product { id: number; code: string; name: string; capacity: string; capacityUnit: string; saleUnit: string; onHand: string | null }
interface Line { productId: number; quantity: string; override: string; reason: string; editing: boolean }
type Quote = NonNullable<Awaited<ReturnType<typeof quoteAction>>>;

export function Pos({ products, methods, drivers, initialCustomer, perms, symbol, today }: {
  products: Product[]; methods: { id: number; name: string; kind: string }[]; drivers: { id: number; fullName: string }[];
  initialCustomer: PickedCustomer | null; perms: { discount: boolean; override: boolean; backdate: boolean; pay: boolean; delivery: boolean; newCustomer: boolean; remind: boolean };
  symbol: string; today: string;
}) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<PickedCustomer | null>(initialCustomer);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [discount, setDiscount] = React.useState("");
  const [charges, setCharges] = React.useState("");
  const [chargesNote, setChargesNote] = React.useState("");
  const [paid, setPaid] = React.useState("");
  const [methodId, setMethodId] = React.useState(methods[0] ? String(methods[0].id) : "");
  const [reference, setReference] = React.useState("");
  const [applyCredit, setApplyCredit] = React.useState(true);
  const [saleDate, setSaleDate] = React.useState(today);
  const [addressId, setAddressId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [deliver, setDeliver] = React.useState(false);
  const [delivery, setDelivery] = React.useState({ date: today, driver: "", notes: "" });
  const [remind, setRemind] = React.useState({ on: false, at: "", note: "" });
  const [key, setKey] = React.useState(newKey);
  const [done, setDone] = React.useState<{ id: number; number: string } | null>(null);

  // live prices from the server pricing engine (source of truth)
  React.useEffect(() => {
    let live = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      const q = await quoteAction(customer?.id ?? null, lines.map(l => ({ productId: l.productId, quantity: l.quantity || "0", unitPrice: l.override || null })), saleDate);
      if (live) { setQuote(q); setQuoting(false); }
    }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [customer?.id, lines, saleDate]);
  React.useEffect(() => { setAddressId(""); }, [customer?.id]);

  const add = (p: Product) => setLines(ls => {
    const i = ls.findIndex(l => l.productId === p.id);
    if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
    return [...ls, { productId: p.id, quantity: "1", override: "", reason: "", editing: false }];
  });
  const upd = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const subtotal = D(quote?.subtotal ?? 0);
  const total = money(subtotal.minus(D(discount || 0)).plus(D(charges || 0)));
  const credit = D(quote?.credit ?? 0);
  const creditUse = applyCredit ? (credit.lessThan(total) ? credit : total) : D(0);
  const dueNow = money(total.minus(creditUse));
  const paidD = D(paid || 0);
  const remaining = money(dueNow.minus(paidD));
  const priceOf = (productId: number) => quote?.lines.find(l => l.productId === productId);
  const balance = D(quote?.balance ?? customer?.balance ?? 0);
  const afterBalance = money(balance.plus(total).minus(paidD));

  const post = useAction(postSaleAction, { onSuccess: d => { setDone(d); router.refresh(); } });
  const submit = () => post.run({
    customerId: customer?.id ?? 0, saleDate, addressId: addressId ? Number(addressId) : null,
    items: lines.filter(l => Number(l.quantity) > 0).map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.override || null, overrideReason: l.reason || null })),
    discount: discount || null, charges: charges || null, chargesNote: chargesNote || null,
    payment: paidD.greaterThan(0) ? { amount: paid, methodId: Number(methodId), reference: reference || null } : null,
    applyCredit, notes: notes || null, idempotencyKey: key,
    reminder: remind.on && remind.at ? { remindAt: remind.at, note: remind.note || null } : null,
    delivery: deliver ? { scheduledDate: delivery.date, assignedToId: delivery.driver ? Number(delivery.driver) : null, notes: delivery.notes || null } : null,
  });
  const reset = () => { setRemind({ on: false, at: "", note: "" }); setLines([]); setDiscount(""); setCharges(""); setChargesNote(""); setPaid(""); setReference(""); setNotes(""); setDeliver(false); setDone(null); setKey(newKey()); setCustomer(null); };

  if (done) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h2 className="mt-3 text-xl font-semibold">Sale {done.number} posted</h2>
        <p className="mt-1 text-sm text-muted-foreground">Invoice, ledger, stock{deliver ? ", delivery" : ""} and the daily statement are updated.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline"><Link href={`/invoices/${done.id}`}><FileDown />Open invoice</Link></Button>
          <Button asChild variant="outline"><a href={`/api/pdf/invoice/${done.id}`} target="_blank" rel="noreferrer"><Printer />Print / PDF</a></Button>
          <Button onClick={reset} autoFocus><ShoppingCart />Next sale</Button>
        </div>
      </Card>
    );
  }

  const canPost = !!customer && lines.some(l => Number(l.quantity) > 0) && !post.busy && !quoting;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
      <div className="grid content-start gap-5">
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1"><CustomerPicker value={customer} onChange={setCustomer} autoFocus={!customer} /></div>
              {perms.newCustomer && <Button variant="outline" className="h-11" asChild><Link href="/customers/new?returnTo=/sales/new"><UserPlus />New customer</Link></Button>}
            </div>
            {customer && quote && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span>Balance: <b className={cn(balance.greaterThan(0) && "text-destructive", balance.lessThan(0) && "text-success")}>{balance.lessThan(0) ? `${formatMoney(balance.abs().toString(), symbol)} credit` : balance.greaterThan(0) ? `${formatMoney(balance.toString(), symbol)} owed` : "settled"}</b></span>
                {quote.creditLimit && <span className="text-muted-foreground">Credit limit {formatMoney(quote.creditLimit, symbol)}</span>}
                {quote.addresses.length > 1 ? (
                  <select value={addressId} onChange={e => setAddressId(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-sm" aria-label="Address">
                    <option value="">{quote.addresses.find(a => a.isPrimary)?.text ?? "Main address"}</option>
                    {quote.addresses.filter(a => !a.isPrimary).map(a => <option key={a.id} value={a.id}>{a.text}</option>)}
                  </select>
                ) : quote.addresses[0] && <span className="text-muted-foreground">{quote.addresses[0].text}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map(p => {
            const q = priceOf(p.id);
            return (
              <button key={p.id} type="button" onClick={() => add(p)} className="group rounded-xl border bg-card p-4 text-left transition hover:border-primary hover:shadow-sm active:scale-[0.99]">
                <div className="flex items-start justify-between"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Droplets className="size-5" /></span><Plus className="size-4 text-muted-foreground group-hover:text-primary" /></div>
                <p className="mt-3 font-medium leading-tight">{p.name}</p>
                <p className="text-xs text-muted-foreground">{Number(p.capacity)} {p.capacityUnit} · {p.saleUnit}{p.onHand !== null ? ` · ${Number(p.onHand)} in stock` : ""}</p>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            {!lines.length && <p className="px-5 pb-4 text-sm text-muted-foreground">Tap a product above to add it. The price comes from the customer&apos;s price list automatically.</p>}
            {lines.map((l, i) => {
              const p = products.find(x => x.id === l.productId)!;
              const q = priceOf(l.productId);
              return (
                <div key={l.productId} className="grid gap-2 border-t px-5 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {q ? <>{formatPrice(q.unitPrice, symbol)} per {p.saleUnit}<Badge tone={q.source === "DEFAULT" ? "outline" : q.source === "OVERRIDE" ? "warning" : "primary"}>{PRICE_SOURCES[q.source as PriceSource]}</Badge>{q.source !== "DEFAULT" && q.source !== "OVERRIDE" && <span>default {formatPrice(q.defaultPrice, symbol)}</span>}</> : "…"}
                      {perms.override && <button type="button" className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => upd(i, { editing: !l.editing })}><PencilLine className="size-3" />change price</button>}
                    </p>
                    {l.editing && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Input className="h-8 w-28" inputMode="decimal" placeholder="Unit price" value={l.override} onChange={e => upd(i, { override: e.target.value })} aria-label="Override price" />
                        <Input className="h-8 min-w-48 flex-1" placeholder="Reason (required)" value={l.reason} onChange={e => upd(i, { reason: e.target.value })} aria-label="Override reason" />
                        {l.override && <Button size="sm" variant="ghost" onClick={() => upd(i, { override: "", reason: "", editing: false })}>Use list price</Button>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="size-8" onClick={() => upd(i, { quantity: String(Math.max(0, Number(l.quantity || 0) - 1)) })} aria-label="Less"><Minus /></Button>
                    <Input className="h-8 w-16 text-center tabular" inputMode="decimal" value={l.quantity} onChange={e => upd(i, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} aria-label={`Quantity of ${p.name}`} />
                    <Button size="icon" variant="outline" className="size-8" onClick={() => upd(i, { quantity: String(Number(l.quantity || 0) + 1) })} aria-label="More"><Plus /></Button>
                  </div>
                  <p className="w-24 text-right font-semibold tabular">{q ? formatMoney(q.lineTotal, symbol) : "…"}</p>
                  <Button size="icon" variant="ghost" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            {perms.backdate && <Field label="Sale date"><Input type="date" value={saleDate} max={today} onChange={e => setSaleDate(e.target.value || today)} /></Field>}
            <Field label="Notes"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
            {perms.delivery && (
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={deliver} onCheckedChange={c => setDeliver(!!c)} /><Truck className="size-4" />Deliver this order</label>
                {deliver && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Delivery date"><Input type="date" value={delivery.date} min={today} onChange={e => setDelivery(d => ({ ...d, date: e.target.value }))} /></Field>
                    <Field label="Driver"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={delivery.driver} onChange={e => setDelivery(d => ({ ...d, driver: e.target.value }))}><option value="">Assign later</option>{drivers.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
                    <Field label="Delivery note"><Input value={delivery.notes} onChange={e => setDelivery(d => ({ ...d, notes: e.target.value }))} /></Field>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />Payment {quoting && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Row k="Subtotal" v={formatMoney(subtotal.toString(), symbol)} />
            {perms.discount && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Discount"><Input inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" /></Field>
                <Field label="Extra charges"><Input inputMode="decimal" value={charges} onChange={e => setCharges(e.target.value)} placeholder="0.00" /></Field>
                {D(charges || 0).greaterThan(0) && <div className="col-span-2"><Input value={chargesNote} onChange={e => setChargesNote(e.target.value)} placeholder="What is the charge for?" /></div>}
              </div>
            )}
            <Separator />
            <Row k={<span className="text-base font-semibold">Total</span>} v={<span className="text-2xl font-semibold">{formatMoney(total.toString(), symbol)}</span>} />
            {credit.greaterThan(0) && (
              <label className="flex items-center justify-between gap-2 rounded-lg bg-success/10 p-2.5">
                <span className="flex items-center gap-2"><Checkbox checked={applyCredit} onCheckedChange={c => setApplyCredit(!!c)} />Use advance credit ({formatMoney(credit.toString(), symbol)})</span>
                <span className="tabular">−{formatMoney(creditUse.toString(), symbol)}</span>
              </label>
            )}
            {perms.pay ? (
              <>
                <Field label="Amount paid now">
                  <div className="flex gap-2">
                    <Input inputMode="decimal" className="h-10 text-lg tabular" value={paid} onChange={e => setPaid(e.target.value)} placeholder="0.00" aria-label="Amount paid" />
                    <Button type="button" variant="outline" className="h-10" onClick={() => setPaid(dueNow.greaterThan(0) ? dueNow.toFixed(2) : "")}>Full</Button>
                    <Button type="button" variant="outline" className="h-10" onClick={() => setPaid("")}>None</Button>
                  </div>
                </Field>
                {paidD.greaterThan(0) && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Method"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={methodId} onChange={e => setMethodId(e.target.value)}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
                    <Field label="Reference"><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Txn ID" /></Field>
                  </div>
                )}
              </>
            ) : <Alert tone="info" title="Credit sale">You cannot take payments; the full amount goes on the customer&apos;s account.</Alert>}
            <Separator />
            {remaining.greaterThan(0) && <Row k="Goes on account (credit sale)" v={<b className="text-destructive">{formatMoney(remaining.toString(), symbol)}</b>} />}
            {remaining.greaterThan(0) && perms.remind && (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-2.5">
                <label className="flex items-center gap-2 font-medium"><Checkbox checked={remind.on} onCheckedChange={c => setRemind(r => ({ ...r, on: !!c, at: r.at || tomorrowAt(9) }))} />Customer will pay later — remind me to call</label>
                {remind.on && (
                  <div className="mt-2 grid gap-2">
                    <Input type="datetime-local" value={remind.at} onChange={e => setRemind(r => ({ ...r, at: e.target.value }))} aria-label="Call at" />
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setRemind(r => ({ ...r, at: localIn(120) }))}>In 2 h</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRemind(r => ({ ...r, at: tomorrowAt(9) }))}>Tomorrow 9:00</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRemind(r => ({ ...r, at: localIn(7 * 1440) }))}>In a week</Button>
                    </div>
                    <Input value={remind.note} onChange={e => setRemind(r => ({ ...r, note: e.target.value }))} placeholder="What did the customer say?" />
                  </div>
                )}
              </div>
            )}
            {remaining.lessThan(0) && <Row k="Extra paid → older debt / advance" v={<b className="text-success">{formatMoney(remaining.abs().toString(), symbol)}</b>} />}
            {remaining.isZero() && total.greaterThan(0) && <Row k="Fully paid" v={<b className="text-success">✓</b>} />}
            {customer && <Row k="Balance after this sale" v={<span className="tabular">{afterBalance.lessThan(0) ? `${formatMoney(afterBalance.abs().toString(), symbol)} credit` : formatMoney(afterBalance.toString(), symbol)}</span>} />}
            {post.error && <Alert tone="danger" title={post.error} />}
            <Button className="h-12 text-base" disabled={!canPost} loading={post.busy} onClick={submit}><ShoppingCart />Post sale {total.greaterThan(0) ? formatMoney(total.toString(), symbol) : ""}</Button>
            {!customer && <p className="text-center text-xs text-muted-foreground">Choose the customer first.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="tabular">{v}</span></div>;
}
