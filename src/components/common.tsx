// Presentational building blocks usable from server and client components.
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatMoney, D } from "@/lib/money";
import { label } from "@/lib/constants";

export function PageHeader({ title, description, actions, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden", className)}>
      <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Money({ value, symbol = "$", className, signed, colored }: { value: string | number | null | undefined; symbol?: string; className?: string; signed?: boolean; colored?: boolean }) {
  const d = D(value ?? 0);
  return (
    <span className={cn("tabular whitespace-nowrap", colored && d.greaterThan(0) && "text-destructive", colored && d.lessThan(0) && "text-success", className)}>
      {formatMoney(value ?? 0, symbol, { sign: signed })}
    </span>
  );
}

/** Customer balance with its meaning: owes / credit / settled. */
export function Balance({ value, symbol = "$", className }: { value: string | number | null | undefined; symbol?: string; className?: string }) {
  const d = D(value ?? 0);
  if (d.isZero()) return <span className={cn("tabular text-muted-foreground", className)}>{formatMoney(0, symbol)} <span className="text-xs">settled</span></span>;
  if (d.greaterThan(0)) return <span className={cn("tabular whitespace-nowrap font-medium text-destructive", className)}>{formatMoney(d.toString(), symbol)} <span className="text-xs font-normal">owes</span></span>;
  return <span className={cn("tabular whitespace-nowrap font-medium text-success", className)}>{formatMoney(d.abs().toString(), symbol)} <span className="text-xs font-normal">credit</span></span>;
}

export function StatCard({ title, value, hint, icon: Icon, tone = "default", href }: { title: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "default" | "primary" | "success" | "warning" | "danger"; href?: string }) {
  const toneCls = { default: "bg-muted text-muted-foreground", primary: "bg-primary/12 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/20 text-[color-mix(in_oklch,var(--warning)_60%,var(--foreground))]", danger: "bg-destructive/12 text-destructive" }[tone];
  const body = (
    <Card className={cn("h-full p-4 transition-colors", href && "hover:border-primary/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneCls)}><Icon className="size-4.5" /></span>}
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

const INVOICE_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  PAID: "success", PARTIALLY_PAID: "warning", UNPAID: "danger", OVERDUE: "danger", CANCELLED: "outline", DRAFT: "default",
  POSTED: "success", REVERSED: "outline", VOID: "outline",
  PENDING: "default", ASSIGNED: "primary", OUT_FOR_DELIVERY: "warning", DELIVERED: "success", FAILED: "danger",
  ACTIVE: "success", INACTIVE: "outline",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={INVOICE_TONE[status] ?? "default"} className={className}>{status === "OVERDUE" ? "Overdue" : label(status)}</Badge>;
}

/** Pager that keeps the other query parameters. */
export function Pager({ total, page, pageSize, params, basePath }: { total: number; page: number; pageSize: number; params: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground print:hidden">
      <span>{Math.min(total, (page - 1) * pageSize + 1)}–{Math.min(total, page * pageSize)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))} className={cn("inline-flex size-8 items-center justify-center rounded-md border bg-card", page <= 1 && "pointer-events-none opacity-40")} aria-label="Previous page"><ChevronLeft className="size-4" /></Link>
        <span className="px-2 tabular">{page} / {pages}</span>
        <Link aria-disabled={page >= pages} href={href(Math.min(pages, page + 1))} className={cn("inline-flex size-8 items-center justify-center rounded-md border bg-card", page >= pages && "pointer-events-none opacity-40")} aria-label="Next page"><ChevronRight className="size-4" /></Link>
      </div>
    </div>
  );
}

export function KV({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[max-content_1fr]", className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 font-medium">{v ?? "—"}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{children}</h2>{actions}</div>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="rounded-full bg-muted p-3"><Icon className="size-5 text-muted-foreground" /></div>
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export const pageOf = (v: string | undefined) => Math.max(1, Number.parseInt(v ?? "1", 10) || 1);

/** Positive integer id from a route/query param, or null (never NaN into the database). */
export function idOf(v: string | undefined | null): number | null {
  if (!v || !/^[0-9]{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}
