"use client";
// Client-side helpers: filters in the URL, period picker, customer search picker, action runner with toasts.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Search, UserRound, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchCustomersAction } from "@/app/actions/lookup";
import { formatMoney } from "@/lib/money";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

/** Run a server action with busy state, toast on error/success and field errors. */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<Result<T>>, opts: { success?: string | ((d: T) => string); onSuccess?: (d: T) => void } = {}) {
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async (...args: A): Promise<T | null> => {
    setBusy(true); setErrors({}); setError(null);
    try {
      const r = await action(...args);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {}); setError(r.error); toast.error(r.error);
        return null;
      }
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r.data) : opts.success);
      opts.onSuccess?.(r.data);
      return r.data;
    } catch {
      const msg = "Could not reach the server. Check the connection and try again.";
      setError(msg); toast.error(msg);
      return null;
    } finally { setBusy(false); }
  }, [action, opts]);
  return { run, busy, errors, error, setErrors };
}

/** Write a set of query params and navigate (keeps the others, resets the page). */
export function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return React.useCallback((updates: Record<string, string | null | undefined>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) { if (v) q.set(k, v); else q.delete(k); }
    if (!("page" in updates)) q.delete("page");
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }, [router, pathname, sp]);
}

export function SearchInput({ name = "q", placeholder = "Search…", className }: { name?: string; placeholder?: string; className?: string }) {
  const sp = useSearchParams();
  const nav = useQueryNav();
  const [v, setV] = React.useState(sp.get(name) ?? "");
  React.useEffect(() => { setV(sp.get(name) ?? ""); }, [sp, name]);
  React.useEffect(() => {
    const t = setTimeout(() => { if ((sp.get(name) ?? "") !== v) nav({ [name]: v.trim() || null }); }, 350);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={cn("relative block w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} className="pl-8" aria-label={placeholder} />
    </label>
  );
}

export function SelectFilter({ name, options, placeholder, className }: { name: string; options: { value: string; label: string }[]; placeholder: string; className?: string }) {
  const sp = useSearchParams();
  const nav = useQueryNav();
  return (
    <select value={sp.get(name) ?? ""} onChange={e => nav({ [name]: e.target.value || null })} aria-label={placeholder}
      className={cn("h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/50", className)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const PRESETS = [
  { v: "today", l: "Today" }, { v: "yesterday", l: "Yesterday" }, { v: "week", l: "This week" }, { v: "month", l: "This month" }, { v: "lastmonth", l: "Last month" },
];

export function PeriodPicker({ preset, from, to }: { preset: string; from: string; to: string }) {
  const nav = useQueryNav();
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);
  React.useEffect(() => { setF(from); setT(to); }, [from, to]);
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="inline-flex flex-wrap rounded-lg bg-muted p-1">
        {PRESETS.map(p => (
          <button key={p.v} type="button" onClick={() => nav({ period: p.v, from: null, to: null })}
            className={cn("rounded-md px-2.5 py-1 text-sm font-medium transition-colors", preset === p.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {p.l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input type="date" value={f} onChange={e => setF(e.target.value)} className="h-9 w-[9.5rem]" aria-label="From" />
        <span className="text-muted-foreground">–</span>
        <Input type="date" value={t} onChange={e => setT(e.target.value)} className="h-9 w-[9.5rem]" aria-label="To" />
        <Button variant={preset === "custom" ? "default" : "outline"} size="sm" onClick={() => f && t && nav({ period: "custom", from: f, to: t })}>Apply</Button>
      </div>
    </div>
  );
}

export interface PickedCustomer { id: number; code: string; name: string; phone: string; balance: string; address?: string }

/** Searchable customer dropdown: by name, phone, code or local address. */
export function CustomerPicker({ value, onChange, autoFocus, placeholder = "Search customer by name, phone or local address…" }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; autoFocus?: boolean; placeholder?: string }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<PickedCustomer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchCustomersAction(q);
      if (live) { setRows(r); setHi(0); setLoading(false); }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, open]);
  const pick = (c: PickedCustomer) => { onChange(c); setOpen(false); setQ(""); };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" autoFocus={autoFocus} className="flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/50">
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="min-w-0 flex-1 truncate"><span className="font-medium">{value.name}</span> <span className="text-muted-foreground">· {value.phone} · {value.code}</span></span>
          ) : <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>}
          {value ? <X className="size-4 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); onChange(null); }} /> : <ChevronsUpDown className="size-4 text-muted-foreground" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-80 rounded-lg border bg-popover p-1 shadow-lg">
          <div className="relative p-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type name, phone, code or place…" className="pl-8"
              onKeyDown={e => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(rows.length - 1, h + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
                if (e.key === "Enter" && rows[hi]) { e.preventDefault(); pick(rows[hi]); }
              }} />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Searching…</p>}
            {!loading && !rows.length && <p className="px-3 py-3 text-sm text-muted-foreground">No customer found.</p>}
            {!loading && rows.map((c, i) => (
              <button key={c.id} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(c)}
                className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm", i === hi && "bg-accent")}>
                <Check className={cn("mt-0.5 size-4 shrink-0", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{c.name}</span><span className={cn("tabular text-xs", Number(c.balance) > 0 ? "text-destructive" : Number(c.balance) < 0 ? "text-success" : "text-muted-foreground")}>{Number(c.balance) < 0 ? `${formatMoney(-Number(c.balance))} credit` : Number(c.balance) > 0 ? `${formatMoney(c.balance)} owes` : "settled"}</span></span>
                  <span className="block truncate text-xs text-muted-foreground">{c.phone} · {c.code}{c.address ? ` · ${c.address}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return <Button variant="outline" onClick={() => window.print()} className="print:hidden">{label}</Button>;
}
