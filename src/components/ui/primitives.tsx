"use client";
// Small building blocks in the shadcn/ui style: input, label, card, badge, table, skeleton, alert,
// checkbox, switch, separator, tabs, tooltip.
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(
      "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors",
      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive", className)} {...props} />
  ));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(
      "flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs",
      "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", className)} {...props} />
  ));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium leading-none", className)} {...props} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

const badgeTones = {
  default: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-[color-mix(in_oklch,var(--warning)_55%,var(--foreground))]",
  danger: "bg-destructive/12 text-destructive",
  outline: "border text-muted-foreground",
} as const;
export function Badge({ tone = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)} {...props} />;
}

export function StatusDot({ tone }: { tone: "success" | "warning" | "danger" | "muted" }) {
  const color = { success: "bg-success", warning: "bg-warning", danger: "bg-destructive", muted: "bg-muted-foreground/40" }[tone];
  return <span className={cn("inline-block size-2 rounded-full", color, tone === "success" && "shadow-[0_0_0_3px] shadow-success/20")} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="w-full overflow-x-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>;
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="[&_tr]:border-b" {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-muted/40", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function Alert({ tone = "info", title, children, className, onDismiss }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string; onDismiss?: () => void }) {
  const Icon = { info: Info, warning: AlertTriangle, danger: XCircle, success: CheckCircle2 }[tone];
  const color = { info: "border-primary/30 bg-primary/5", warning: "border-warning/40 bg-warning/10", danger: "border-destructive/40 bg-destructive/5", success: "border-success/40 bg-success/10" }[tone];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3 text-sm", color, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="grid flex-1 gap-0.5">{title && <p className="font-medium">{title}</p>}{children && <div className="text-muted-foreground">{children}</div>}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-m-1 h-fit rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn("peer size-4 shrink-0 rounded-[4px] border border-input bg-card shadow-xs",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center"><Check className="size-3" /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:opacity-50", className)} {...props}>
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export function Separator({ className, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return <SeparatorPrimitive.Root className={cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-all",
    "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...props} />;
}
export const TabsContent = TabsPrimitive.Content;
