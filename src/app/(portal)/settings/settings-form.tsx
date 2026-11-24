"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/common";
import { useAction } from "@/components/client-kit";
import { savePaymentMethodAction, updateSettingsAction } from "@/app/actions/mutations";
import { PAYMENT_METHOD_KINDS, label } from "@/lib/constants";

export interface SettingsValues {
  companyName: string; tagline: string; address: string; phone: string; email: string; taxNumber: string; logoDataUrl: string;
  currencyCode: string; currencySymbol: string; timezone: string; invoicePrefix: string; receiptPrefix: string; creditNotePrefix: string;
  paymentTermsDays: string; allowNegativeStock: boolean; lowStockThreshold: string; invoiceFooter: string;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [v, setV] = React.useState(initial);
  const save = useAction(updateSettingsAction, { success: "Settings saved" });
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV(s => ({ ...s, [k]: val }));
  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000) { toast.error("Use an image under 1 MB"); return; }
    const r = new FileReader();
    r.onload = () => set("logoDataUrl", String(r.result));
    r.readAsDataURL(file);
  };
  return (
    <form className="grid gap-5" onSubmit={e => { e.preventDefault(); save.run(v); }}>
      {save.error && <Alert tone="danger" title={save.error} />}
      <Card><CardHeader><CardTitle>Company</CardTitle><CardDescription>Printed on invoices, receipts and statements.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name *" error={save.errors.companyName}><Input value={v.companyName} onChange={e => set("companyName", e.target.value)} /></Field>
          <Field label="Tagline"><Input value={v.tagline} onChange={e => set("tagline", e.target.value)} /></Field>
          <Field label="Address"><Input value={v.address} onChange={e => set("address", e.target.value)} /></Field>
          <Field label="Phone"><Input value={v.phone} onChange={e => set("phone", e.target.value)} /></Field>
          <Field label="E-mail"><Input value={v.email} onChange={e => set("email", e.target.value)} /></Field>
          <Field label="Tax number"><Input value={v.taxNumber} onChange={e => set("taxNumber", e.target.value)} /></Field>
          <Field label="Logo (PNG/JPEG, under 1 MB)" error={save.errors.logoDataUrl}>
            <div className="flex items-center gap-3">
              {v.logoDataUrl && <img src={v.logoDataUrl} alt="Logo" className="h-12 w-auto rounded border bg-white p-1" />}
              <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => onLogo(e.target.files?.[0])} />
              {v.logoDataUrl && <Button type="button" variant="ghost" onClick={() => set("logoDataUrl", "")}>Remove</Button>}
            </div>
          </Field>
          <Field label="Invoice footer"><Textarea rows={2} value={v.invoiceFooter} onChange={e => set("invoiceFooter", e.target.value)} placeholder="Thank you! Please return empty containers." /></Field>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Money, time and numbering</CardTitle><CardDescription>Changing prefixes only affects new documents. Existing numbers never change.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Currency code" error={save.errors.currencyCode}><Input value={v.currencyCode} maxLength={3} onChange={e => set("currencyCode", e.target.value.toUpperCase())} /></Field>
          <Field label="Currency symbol"><Input value={v.currencySymbol} onChange={e => set("currencySymbol", e.target.value)} /></Field>
          <Field label="Timezone" hint="IANA name, e.g. Africa/Mogadishu" error={save.errors.timezone}><Input value={v.timezone} onChange={e => set("timezone", e.target.value)} /></Field>
          <Field label="Payment terms (days)"><Input inputMode="numeric" value={v.paymentTermsDays} onChange={e => set("paymentTermsDays", e.target.value)} /></Field>
          <Field label="Invoice prefix" error={save.errors.invoicePrefix}><Input value={v.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value.toUpperCase())} /></Field>
          <Field label="Receipt prefix" error={save.errors.receiptPrefix}><Input value={v.receiptPrefix} onChange={e => set("receiptPrefix", e.target.value.toUpperCase())} /></Field>
          <Field label="Credit note prefix" error={save.errors.creditNotePrefix}><Input value={v.creditNotePrefix} onChange={e => set("creditNotePrefix", e.target.value.toUpperCase())} /></Field>
          <Field label="Low stock threshold"><Input inputMode="decimal" value={v.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-3 lg:col-span-4"><Checkbox checked={v.allowNegativeStock} onCheckedChange={c => set("allowNegativeStock", !!c)} />Allow sales when stock would go below zero (otherwise only users with the override permission can)</label>
        </CardContent></Card>
      <div className="flex justify-end"><Button type="submit" loading={save.busy}>Save settings</Button></div>
    </form>
  );
}

export function PaymentMethods({ rows }: { rows: { id: number; code: string; name: string; kind: string; isActive: boolean; sortOrder: number }[] }) {
  const [n, setN] = React.useState({ code: "", name: "", kind: "MOBILE" });
  const save = useAction(savePaymentMethodAction, { success: "Payment method saved", onSuccess: () => setN({ code: "", name: "", kind: "MOBILE" }) });
  return (
    <Card><CardHeader><CardTitle>Payment methods</CardTitle><CardDescription>Shown on sales, payments, expenses and refunds. Methods are disabled, never deleted.</CardDescription></CardHeader>
      <CardContent className="px-0 pb-3">
        <Table><THead><TR><TH>Code</TH><TH>Name</TH><TH>Kind</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>{rows.map(m => (
            <TR key={m.id}><TD className="font-mono text-xs">{m.code}</TD><TD>{m.name}</TD><TD>{label(m.kind)}</TD><TD><StatusBadge status={m.isActive ? "ACTIVE" : "INACTIVE"} /></TD>
              <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => save.run({ ...m, isActive: !m.isActive })}>{m.isActive ? "Disable" : "Enable"}</Button></TD></TR>
          ))}</TBody></Table>
        <form className="mx-5 mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); save.run({ ...n, isActive: true, sortOrder: rows.length + 1 }); }}>
          <Input className="w-28" placeholder="Code" value={n.code} onChange={e => setN({ ...n, code: e.target.value.toUpperCase() })} />
          <Input className="w-48" placeholder="Name" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} />
          <select className="h-9 rounded-md border bg-card px-2 text-sm" value={n.kind} onChange={e => setN({ ...n, kind: e.target.value })}>{PAYMENT_METHOD_KINDS.map(k => <option key={k} value={k}>{label(k)}</option>)}</select>
          <Button type="submit" variant="outline" loading={save.busy}><Plus />Add</Button>
          {save.error && <p className="w-full text-sm text-destructive">{save.error}</p>}
        </form>
      </CardContent></Card>
  );
}
