"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Tags, UserRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { AddressFields, addressPayload, emptyAddress, type AddressValue, type LocOpt } from "@/components/address-fields";
import { useAction } from "@/components/client-kit";
import { createCustomerAction, updateCustomerAction } from "@/app/actions/mutations";
import { CUSTOMER_TYPES, label } from "@/lib/constants";
import { formatPrice } from "@/lib/money";

const sel = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/50";

export interface ProductOpt { id: number; name: string; capacity: string; capacityUnit: string; saleUnit: string; defaultPrice: string }
export interface CustomerValues { name: string; phone: string; altPhone: string; customerType: string; groupId: string; status: string; registeredOn: string; creditLimit: string; notes: string }

export function CustomerForm({ mode, customerId, initial, products, groups, locations, canPrice, canOpening, symbol, today, returnTo }: {
  mode: "new" | "edit"; customerId?: number; initial?: Partial<CustomerValues>; products: ProductOpt[]; groups: { id: number; name: string }[]; locations: LocOpt[];
  canPrice: boolean; canOpening: boolean; symbol: string; today: string; returnTo?: string;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<CustomerValues>({ name: "", phone: "", altPhone: "", customerType: "RESIDENTIAL", groupId: "", status: "ACTIVE", registeredOn: today, creditLimit: "", notes: "", ...initial });
  const [addr, setAddr] = React.useState<AddressValue>(emptyAddress);
  const [prices, setPrices] = React.useState<Record<number, { on: boolean; price: string }>>({});
  const [opening, setOpening] = React.useState({ amount: "", side: "owes" as "owes" | "credit" });
  const [dupOpen, setDupOpen] = React.useState(false);
  const set = (k: keyof CustomerValues, val: string) => setV(s => ({ ...s, [k]: val }));

  const payload = () => ({
    name: v.name, phone: v.phone, altPhone: v.altPhone || null, customerType: v.customerType as (typeof CUSTOMER_TYPES)[number], groupId: v.groupId || null,
    status: v.status as "ACTIVE" | "INACTIVE", registeredOn: v.registeredOn || undefined, creditLimit: v.creditLimit || null, notes: v.notes || null,
  });
  const create = useAction(createCustomerAction, { success: d => `${d.name} registered as ${d.code}`, onSuccess: d => router.push(returnTo ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}customer=${d.id}` : `/customers/${d.id}`) });
  const update = useAction(updateCustomerAction, { success: "Customer updated", onSuccess: () => router.push(`/customers/${customerId}`) });
  const busy = create.busy || update.busy;
  const errors = mode === "new" ? create.errors : update.errors;
  const error = mode === "new" ? create.error : update.error;

  const submit = async (allowDup = false) => {
    if (mode === "edit") {
      await update.run(customerId!, payload(), allowDup);
      return;
    }
    const amt = opening.amount.trim();
    await create.run({
      ...payload(), address: addressPayload(addr),
      prices: Object.entries(prices).filter(([, p]) => p.on && p.price.trim() !== "").map(([id, p]) => ({ productId: Number(id), price: p.price.trim() })),
      openingBalance: amt ? (opening.side === "credit" ? `-${amt}` : amt) : undefined,
    }, allowDup);
  };
  React.useEffect(() => { if (errors.phone?.includes("already used")) setDupOpen(true); }, [errors.phone]);

  return (
    <form className="grid gap-5" onSubmit={e => { e.preventDefault(); submit(false); }}>
      {error && !errors.phone && <Alert tone="danger" title={error} />}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4 text-primary" />1. Customer details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name *" error={errors.name}><Input value={v.name} onChange={e => set("name", e.target.value)} autoFocus aria-invalid={!!errors.name} /></Field>
          <Field label="Phone *" error={errors.phone}><Input value={v.phone} onChange={e => set("phone", e.target.value)} inputMode="tel" placeholder="+252 61 …" aria-invalid={!!errors.phone} /></Field>
          <Field label="Alternative phone" error={errors.altPhone}><Input value={v.altPhone} onChange={e => set("altPhone", e.target.value)} inputMode="tel" /></Field>
          <Field label="Customer type"><select className={sel} value={v.customerType} onChange={e => set("customerType", e.target.value)}>{CUSTOMER_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
          <Field label="Price group" hint="Optional: group prices apply when the customer has no own price"><select className={sel} value={v.groupId} onChange={e => set("groupId", e.target.value)}><option value="">No group</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Registration date"><Input type="date" value={v.registeredOn} max={today} onChange={e => set("registeredOn", e.target.value)} /></Field>
          <Field label="Credit limit" hint="Leave empty for no limit" error={errors.creditLimit}><Input inputMode="decimal" value={v.creditLimit} onChange={e => set("creditLimit", e.target.value)} placeholder="e.g. 50" /></Field>
          {mode === "edit" && <Field label="Status"><select className={sel} value={v.status} onChange={e => set("status", e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}
          <div className="sm:col-span-2 lg:col-span-3"><Field label="Notes"><Textarea rows={2} value={v.notes} onChange={e => set("notes", e.target.value)} /></Field></div>
        </CardContent>
      </Card>

      {mode === "new" && (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-primary" />2. Local address</CardTitle><CardDescription>Register the address the way local people know it. District, neighbourhood and landmark lists are managed under Locations.</CardDescription></CardHeader>
            <CardContent><AddressFields value={addr} onChange={setAddr} locations={locations} errors={errors} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Tags className="size-4 text-primary" />3. Products and special prices</CardTitle><CardDescription>Tick a product only if this customer pays a different price. Everyone else pays the default price at the time of the sale.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {!canPrice && <Alert tone="info" title="You cannot set special prices">The customer will pay the default prices; an administrator can add special prices later.</Alert>}
              {products.map(p => {
                const cur = prices[p.id] ?? { on: false, price: "" };
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                    <Checkbox id={`p${p.id}`} disabled={!canPrice} checked={cur.on} onCheckedChange={c => setPrices(s => ({ ...s, [p.id]: { ...cur, on: !!c, price: cur.price || p.defaultPrice.replace(/\.?0+$/, "") } }))} />
                    <label htmlFor={`p${p.id}`} className="min-w-48 flex-1 text-sm"><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">{Number(p.capacity)} {p.capacityUnit} · default {formatPrice(p.defaultPrice, symbol)} per {p.saleUnit}</span></label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Customer price</span>
                      <Input className="w-28" inputMode="decimal" disabled={!cur.on} value={cur.price} onChange={e => setPrices(s => ({ ...s, [p.id]: { ...cur, price: e.target.value } }))} aria-label={`Price for ${p.name}`} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {canOpening && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />4. Opening balance (optional)</CardTitle><CardDescription>Only for customers who already owed money or had paid in advance before using this system.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <Field label="Amount" error={errors.openingBalance}><Input inputMode="decimal" className="w-36" value={opening.amount} onChange={e => setOpening(o => ({ ...o, amount: e.target.value }))} placeholder="0.00" /></Field>
                <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
                  {(["owes", "credit"] as const).map(s => (
                    <button key={s} type="button" onClick={() => setOpening(o => ({ ...o, side: s }))} className={`rounded-md px-3 py-1 font-medium ${opening.side === s ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                      {s === "owes" ? "Customer owes us" : "Customer has credit"}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={busy}>{mode === "new" ? "Save customer" : "Save changes"}</Button>
      </div>

      <ConfirmDialog open={dupOpen} onOpenChange={setDupOpen} title="Phone number already registered" description={errors.phone} confirmLabel="Save anyway" onConfirm={() => submit(true)}>
        <p className="text-sm text-muted-foreground">Several customers can share a phone (family, office). Save only if this is really a different customer.</p>
      </ConfirmDialog>
    </form>
  );
}
