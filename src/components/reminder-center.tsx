"use client";
// Payment reminders in the header: a bell with the number of calls due, and a pop-up that opens by itself when a
// reminder's time comes (checked every minute). Each call can be logged right from the pop-up.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Clock, History, MapPin, Phone, PhoneCall, Plus, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Field, Input, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { dueRemindersAction, reminderHistoryAction } from "@/app/actions/lookup";
import { cancelReminderAction, createReminderAction, logCallAction } from "@/app/actions/mutations";
import { REMINDER_OUTCOMES, type ReminderOutcome } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Due = NonNullable<Awaited<ReturnType<typeof dueRemindersAction>>>[number];

const SEEN_KEY = "wp.reminders.seen";
const keyOf = (r: Due) => `${r.id}@${r.remindAt}`;
function readSeen(): string[] { try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; } }
function writeSeen(keys: string[]) { try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-500))); } catch { /* private mode */ } }

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the browser's local time, `minutes` from now. */
export function localIn(minutes: number) {
  const d = new Date(Date.now() + minutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function tomorrowAt(hour: number) {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0);
  return localIn(Math.round((d.getTime() - Date.now()) / 60_000));
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min late`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h late`;
  return `${Math.floor(m / 1440)} d late`;
}

export function ReminderBell({ symbol, canManage }: { symbol: string; canManage: boolean }) {
  const [rows, setRows] = React.useState<Due[]>([]);
  const [open, setOpen] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      const r = await dueRemindersAction();
      if (!r) return;
      setRows(r);
      const seen = new Set(readSeen());
      if (r.some(x => !seen.has(keyOf(x)))) setOpen(true);
    } catch { /* offline: try again next minute */ }
  }, []);
  React.useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);
  React.useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = rows.length ? `(${rows.length}) ${base}` : base;
  }, [rows.length]);
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) writeSeen([...readSeen(), ...rows.map(keyOf)]);
  };
  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label={`Payment reminders${rows.length ? ` (${rows.length} due)` : ""}`}>
        <BellRing className={cn(rows.length && "text-destructive")} />
        {rows.length > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">{rows.length > 99 ? "99+" : rows.length}</span>}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent wide title={rows.length ? `${rows.length} customer${rows.length > 1 ? "s" : ""} to call about payment` : "No calls due"} description="These customers asked to be called back about money they owe. Log each call; a promise sets the next call time.">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing is due right now. <Link className="text-primary hover:underline" href="/reminders" onClick={() => close(false)}>See upcoming reminders</Link></p>}
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {rows.map(r => <DueRow key={r.id} r={r} symbol={symbol} canManage={canManage} onChanged={load} onNavigate={() => close(false)} />)}
          </div>
          <DialogFooter>
            <Button variant="outline" asChild><Link href="/reminders" onClick={() => close(false)}>Open reminders page</Link></Button>
            <Button onClick={() => close(false)}><Clock />Remind me later</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DueRow({ r, symbol, canManage, onChanged, onNavigate }: { r: Due; symbol: string; canManage: boolean; onChanged: () => void; onNavigate: () => void }) {
  const [logging, setLogging] = React.useState(false);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/customers/${r.customer.id}`} onClick={onNavigate} className="font-semibold hover:underline">{r.customer.name}</Link>
          <span className="ml-2 text-xs text-muted-foreground">{r.customer.code}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <a href={`tel:${r.customer.phone}`} className="inline-flex items-center gap-1 font-medium text-primary"><Phone className="size-3.5" />{r.customer.phone}</a>
            {r.customer.altPhone && <a href={`tel:${r.customer.altPhone}`} className="text-primary">{r.customer.altPhone}</a>}
            {r.customer.address && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />{r.customer.address}</span>}
          </div>
          {r.note && <p className="mt-1 rounded bg-muted px-2 py-1 text-sm">“{r.note}”</p>}
          {r.outcome && <p className="mt-1 text-xs text-muted-foreground">Last call: {r.outcome}</p>}
        </div>
        <div className="text-right text-sm">
          <p>Owes <b className="text-destructive">{formatMoney(r.customer.balance, symbol)}</b></p>
          {r.invoice && <p className="text-xs text-muted-foreground">{r.invoice.number}</p>}
          <Badge tone="danger" className="mt-1">{ago(r.remindAt)}</Badge>
          {r.callCount > 0 && <p className="text-xs text-muted-foreground">{r.callCount} call{r.callCount > 1 ? "s" : ""}</p>}
        </div>
      </div>
      {canManage && !logging && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setLogging(true)}><PhoneCall />Log call</Button>
          <Button size="sm" variant="outline" asChild><Link href={`/payments/new?customer=${r.customer.id}${r.invoice ? `&invoice=${r.invoice.id}` : ""}`} onClick={onNavigate}><Wallet />Receive payment</Link></Button>
        </div>
      )}
      {logging && <CallForm reminderId={r.id} onDone={() => { setLogging(false); onChanged(); }} onCancel={() => setLogging(false)} />}
    </div>
  );
}

/** Log the outcome of a call; a promise or no answer needs the next call time. */
export function CallForm({ reminderId, onDone, onCancel }: { reminderId: number; onDone: () => void; onCancel: () => void }) {
  const [outcome, setOutcome] = React.useState<ReminderOutcome>("PROMISED");
  const [note, setNote] = React.useState("");
  const [nextAt, setNextAt] = React.useState(tomorrowAt(9));
  const [close, setClose] = React.useState(false);
  const save = useAction(logCallAction, { success: d => (d.status === "OPEN" ? "Call logged — next call scheduled" : "Call logged — reminder closed"), onSuccess: onDone });
  const closing = close || outcome === "PAID";
  const quick = [{ l: "In 1 hour", v: () => localIn(60) }, { l: "This evening", v: () => { const d = new Date(); d.setHours(18, 0, 0, 0); return localIn(Math.max(5, Math.round((d.getTime() - Date.now()) / 60000))); } }, { l: "Tomorrow 9:00", v: () => tomorrowAt(9) }, { l: "In 3 days", v: () => localIn(3 * 1440) }];
  return (
    <form className="mt-3 grid gap-3 rounded-md bg-muted/50 p-3" onSubmit={e => { e.preventDefault(); save.run({ reminderId, outcome, note: note || null, nextAt: closing ? null : nextAt, close }); }}>
      {save.error && <Alert tone="danger" title={save.error} />}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(REMINDER_OUTCOMES) as ReminderOutcome[]).map(o => (
          <button key={o} type="button" onClick={() => setOutcome(o)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", outcome === o ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{REMINDER_OUTCOMES[o]}</button>
        ))}
      </div>
      <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="What did the customer say?" /></Field>
      {!closing && (
        <Field label="Call again at" error={save.errors.nextAt}>
          <div className="flex flex-wrap gap-2">
            <Input type="datetime-local" className="w-56" value={nextAt} onChange={e => setNextAt(e.target.value)} />
            {quick.map(q => <Button key={q.l} type="button" size="sm" variant="outline" onClick={() => setNextAt(q.v())}>{q.l}</Button>)}
          </div>
        </Field>
      )}
      {outcome !== "PAID" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={close} onChange={e => setClose(e.target.checked)} />No more calls needed — close this reminder</label>}
      <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={onCancel}><X />Back</Button><Button type="submit" size="sm" loading={save.busy}><CheckCircle2 />Save call</Button></div>
    </form>
  );
}

/** "Remind me to call" button for the customer and invoice pages. */
export function NewReminderButton({ customerId, invoiceId, label = "Payment reminder", size = "sm" }: { customerId: number; invoiceId?: number; label?: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [at, setAt] = React.useState(tomorrowAt(9));
  const [note, setNote] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const save = useAction(createReminderAction, { success: "Reminder saved — it will pop up when it is time to call", onSuccess: () => { setOpen(false); setNote(""); setAmount(""); router.refresh(); } });
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}><Plus />{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Remind me to call about payment" description="The reminder pops up for staff at this time. It closes by itself when the customer has paid.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ customerId, invoiceId: invoiceId ?? null, remindAt: at, note: note || null, expectedAmount: amount || null }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Call at" error={save.errors.remindAt}><Input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} /></Field>
              <Field label="Amount promised (optional)" error={save.errors.expectedAmount}><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAt(localIn(60))}>In 1 hour</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAt(tomorrowAt(9))}>Tomorrow 9:00</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAt(localIn(3 * 1440))}>In 3 days</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAt(localIn(7 * 1440))}>In a week</Button>
            </div>
            <Field label="Note"><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Said to call after salary on the 25th" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.busy}>Save reminder</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type HistoryItem = Awaited<ReturnType<typeof reminderHistoryAction>>[number];

/** Expandable call history of one reminder (loaded when first opened). */
export function ReminderHistory({ id }: { id: number }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setFailed(false);
      try { setItems(await reminderHistoryAction(id)); } catch { setFailed(true); }
    }
  };
  return (
    <div className="text-xs">
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1 text-primary hover:underline" aria-expanded={open}>
        <History className="size-3" />{open ? "Hide history" : "History"}
      </button>
      {open && (
        <ol className="mt-1.5 grid gap-1.5 border-l pl-3">
          {failed && <li className="text-destructive">Could not load the history.</li>}
          {!failed && items === null && <li className="text-muted-foreground">Loading…</li>}
          {items?.length === 0 && <li className="text-muted-foreground">No history yet.</li>}
          {items?.map(e => (
            <li key={e.id}>
              <span className="text-muted-foreground">{e.atText}</span> · <b>{e.actionText}</b>
              {e.outcomeText && <> — {e.outcomeText}</>}
              {e.note && <span className="block text-muted-foreground">“{e.note}”</span>}
              {e.nextAtText && <span className="block text-muted-foreground">Next call {e.nextAtText}</span>}
              {e.user && <span className="block text-muted-foreground">by {e.user}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CancelReminderButton({ id }: { id: number }) {
  const router = useRouter();
  const c = useAction(cancelReminderAction, { success: "Reminder cancelled", onSuccess: () => router.refresh() });
  return <Button size="sm" variant="ghost" loading={c.busy} onClick={() => c.run(id, null)} aria-label="Cancel reminder"><X /></Button>;
}
