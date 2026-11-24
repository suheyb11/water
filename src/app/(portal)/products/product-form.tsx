"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/client-kit";
import { createProductAction, updateProductAction } from "@/app/actions/mutations";

export interface ProductValues { code: string; name: string; description: string; capacity: string; capacityUnit: string; saleUnit: string; defaultPrice: string; costPrice: string; status: "ACTIVE" | "INACTIVE"; trackStock: boolean; reorderLevel: string; sortOrder: string; openingStock: string; priceReason: string; priceEffectiveFrom: string }

export function ProductForm({ id, initial, today, symbol }: { id?: number; initial?: Partial<ProductValues>; today: string; symbol: string }) {
  const router = useRouter();
  const [v, setV] = React.useState<ProductValues>({ code: "", name: "", description: "", capacity: "20", capacityUnit: "L", saleUnit: "container", defaultPrice: "", costPrice: "0", status: "ACTIVE", trackStock: true, reorderLevel: "0", sortOrder: "0", openingStock: "", priceReason: "", priceEffectiveFrom: today, ...initial });
  const set = <K extends keyof ProductValues>(k: K, val: ProductValues[K]) => setV(s => ({ ...s, [k]: val }));
  const create = useAction(createProductAction, { success: "Product created", onSuccess: d => router.push(`/products/${d.id}`) });
  const update = useAction(updateProductAction, { success: "Product saved", onSuccess: () => router.refresh() });
  const a = id ? update : create;
  const priceChanged = id && Number(v.defaultPrice) !== Number(initial?.defaultPrice ?? "");
  const payload = { ...v, sortOrder: Number(v.sortOrder) || 0, openingStock: v.openingStock || "0" };
  return (
    <form className="grid gap-5" onSubmit={e => { e.preventDefault(); if (id) update.run(id, payload); else create.run(payload); }}>
      {a.error && <Alert tone="danger" title={a.error} />}
      <Card><CardHeader><CardTitle>Product</CardTitle><CardDescription>Capacity and unit are copied onto each invoice line when sold, so changing them never alters past invoices.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code *" error={a.errors.code}><Input value={v.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="W20" /></Field>
          <div className="sm:col-span-1 lg:col-span-3"><Field label="Name *" error={a.errors.name}><Input value={v.name} onChange={e => set("name", e.target.value)} placeholder="Purified Drinking Water" /></Field></div>
          <Field label="Capacity *" error={a.errors.capacity}><Input inputMode="decimal" value={v.capacity} onChange={e => set("capacity", e.target.value)} /></Field>
          <Field label="Capacity unit"><Input value={v.capacityUnit} onChange={e => set("capacityUnit", e.target.value)} placeholder="L, ml, gal" /></Field>
          <Field label="Sold per"><Input value={v.saleUnit} onChange={e => set("saleUnit", e.target.value)} placeholder="container, bottle, carton" /></Field>
          <Field label="Status"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={v.status} onChange={e => set("status", e.target.value as "ACTIVE" | "INACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
          <div className="sm:col-span-2 lg:col-span-4"><Field label="Description"><Textarea rows={2} value={v.description} onChange={e => set("description", e.target.value)} /></Field></div>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Prices</CardTitle><CardDescription>The default price is used for customers without their own price. Customer prices are not changed by this.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={`Default selling price (${symbol}) *`} error={a.errors.defaultPrice}><Input inputMode="decimal" value={v.defaultPrice} onChange={e => set("defaultPrice", e.target.value)} /></Field>
          <Field label={`Cost price (${symbol})`} hint="For profit reports"><Input inputMode="decimal" value={v.costPrice} onChange={e => set("costPrice", e.target.value)} /></Field>
          {priceChanged && <>
            <Field label="New price effective from"><Input type="date" value={v.priceEffectiveFrom} onChange={e => set("priceEffectiveFrom", e.target.value)} /></Field>
            <Field label="Reason for the price change"><Input value={v.priceReason} onChange={e => set("priceReason", e.target.value)} /></Field>
          </>}
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Stock</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><Checkbox checked={v.trackStock} onCheckedChange={c => set("trackStock", !!c)} />Track stock for this product</label>
          {v.trackStock && <>
            <Field label="Reorder level" hint="Low stock alert at or below"><Input inputMode="decimal" value={v.reorderLevel} onChange={e => set("reorderLevel", e.target.value)} /></Field>
            {!id && <Field label="Opening stock"><Input inputMode="decimal" value={v.openingStock} onChange={e => set("openingStock", e.target.value)} placeholder="0" /></Field>}
          </>}
          <Field label="Sort order"><Input inputMode="numeric" value={v.sortOrder} onChange={e => set("sortOrder", e.target.value)} /></Field>
        </CardContent></Card>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" loading={a.busy}>{id ? "Save product" : "Create product"}</Button></div>
    </form>
  );
}
