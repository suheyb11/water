"use client";
import * as React from "react";
import Link from "next/link";
import { Layers, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { bulkPriceAction, saveGroupAction, setCustomerPriceAction, setGroupPriceAction } from "@/app/actions/mutations";
import { PRICE_SOURCES, type PriceSource } from "@/lib/constants";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Product { id: number; code: string; name: string; capacity: string; capacityUnit: string; defaultPrice: string }
interface Row { customer: { id: number; code: string; name: string; phone: string; group: { name: string } | null }; prices: { productId: number; price: string; source: PriceSource; priceId: number | null; effectiveTo: string | null }[] }

export function PricingGrid({ products, rows, canManage, symbol, today }: { products: Product[]; rows: Row[]; canManage: boolean; symbol: string; today: string }) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [cell, setCell] = React.useState<{ row: Row; product: Product } | null>(null);
  const [bulk, setBulk] = React.useState(false);
  const [f, setF] = React.useState({ price: "", from: today });
  const [b, setB] = React.useState({ productId: products[0] ? String(products[0].id) : "", mode: "SET" as "SET" | "INCREASE_AMOUNT" | "INCREASE_PERCENT", value: "", from: today, reason: "" });
  const save = useAction(setCustomerPriceAction, { success: "Price saved", onSuccess: () => setCell(null) });
  const doBulk = useAction(bulkPriceAction, { success: d => `${(d as unknown[]).length} customer prices changed`, onSuccess: () => { setBulk(false); setSelected(new Set()); } });
  const all = rows.length > 0 && rows.every(r => selected.has(r.customer.id));
  const toggle = (id: number) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Card>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
          <span className="text-muted-foreground">{selected.size ? `${selected.size} selected` : "Tick customers to change many prices at once"}</span>
          <Button size="sm" disabled={!selected.size} onClick={() => setBulk(true)}><Layers />Bulk change</Button>
        </div>
      )}
      <Table>
        <THead><TR>
          {canManage && <TH className="w-8"><Checkbox checked={all} onCheckedChange={c => setSelected(c ? new Set(rows.map(r => r.customer.id)) : new Set())} aria-label="Select all" /></TH>}
          <TH>Customer</TH>
          {products.map(p => <TH key={p.id} className="text-right">{p.name}<p className="font-normal normal-case">default {formatPrice(p.defaultPrice, symbol)}</p></TH>)}
        </TR></THead>
        <TBody>{rows.map(r => (
          <TR key={r.customer.id}>
            {canManage && <TD><Checkbox checked={selected.has(r.customer.id)} onCheckedChange={() => toggle(r.customer.id)} aria-label={`Select ${r.customer.name}`} /></TD>}
            <TD><Link href={`/customers/${r.customer.id}?tab=prices`} className="font-medium hover:underline">{r.customer.name}</Link><p className="text-xs text-muted-foreground">{r.customer.code} · {r.customer.phone}{r.customer.group ? ` · ${r.customer.group.name}` : ""}</p></TD>
            {products.map(p => {
              const x = r.prices.find(y => y.productId === p.id)!;
              return (
                <TD key={p.id} className="text-right">
                  <button type="button" disabled={!canManage} onClick={() => { setF({ price: x.source.startsWith("CUSTOMER") ? Number(x.price).toString() : "", from: today }); setCell({ row: r, product: p }); }}
                    className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 tabular", canManage && "hover:bg-accent", x.source === "DEFAULT" ? "text-muted-foreground" : "font-semibold")}>
                    {formatPrice(x.price, symbol)}{x.source !== "DEFAULT" && <Badge tone={x.source === "CUSTOMER_TEMP" ? "warning" : x.source === "GROUP" ? "default" : "primary"} className="px-1.5">{x.source === "CUSTOMER" ? "own" : x.source === "CUSTOMER_TEMP" ? "temp" : "group"}</Badge>}
                    {canManage && <Pencil className="size-3 opacity-40" />}
                  </button>
                </TD>
              );
            })}
          </TR>
        ))}</TBody>
      </Table>

      <Dialog open={!!cell} onOpenChange={o => !o && setCell(null)}>
        {cell && <DialogContent title={`${cell.row.customer.name} — ${cell.product.name}`} description={`Now: ${PRICE_SOURCES[cell.row.prices.find(y => y.productId === cell.product.id)!.source]}. Past invoices are not affected.`}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ customerId: cell.row.customer.id, productId: cell.product.id, price: f.price, effectiveFrom: f.from }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Customer price (${symbol})`} error={save.errors.price}><Input autoFocus inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></Field>
              <Field label="Effective from"><Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground">Temporary prices and removing a special price are on the customer&apos;s Prices tab.</p>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCell(null)}>Cancel</Button><Button type="submit" loading={save.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>}
      </Dialog>

      <Dialog open={bulk} onOpenChange={setBulk}>
        <DialogContent title={`Change prices for ${selected.size} customers`} description="Each customer's new price is saved with the effective date and logged. Posted invoices never change.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); doBulk.run({ productId: Number(b.productId), customerIds: [...selected], mode: b.mode, value: Number(b.value), effectiveFrom: b.from, reason: b.reason || null }); }}>
            {doBulk.error && <Alert tone="danger" title={doBulk.error} />}
            <Field label="Product"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={b.productId} onChange={e => setB({ ...b, productId: e.target.value })}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <div className="inline-flex flex-wrap rounded-lg bg-muted p-1 text-sm">
              {([["SET", "Set price to"], ["INCREASE_AMOUNT", `Change by ${symbol}`], ["INCREASE_PERCENT", "Change by %"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setB({ ...b, mode: k })} className={cn("rounded-md px-3 py-1 font-medium", b.mode === k ? "bg-card shadow-sm" : "text-muted-foreground")}>{l}</button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={b.mode === "SET" ? `New price (${symbol})` : b.mode === "INCREASE_AMOUNT" ? `Amount (+/−) ${symbol}` : "Percent (+/−)"} hint={b.mode === "SET" ? undefined : "Use a minus sign to lower prices"}><Input autoFocus inputMode="decimal" value={b.value} onChange={e => setB({ ...b, value: e.target.value })} /></Field>
              <Field label="Effective from"><Input type="date" value={b.from} onChange={e => setB({ ...b, from: e.target.value })} /></Field>
            </div>
            <Field label="Reason"><Input value={b.reason} onChange={e => setB({ ...b, reason: e.target.value })} placeholder="New price list 2027" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setBulk(false)}>Cancel</Button><Button type="submit" loading={doBulk.busy}>Apply to {selected.size} customers</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function GroupsPanel({ groups, products, prices, canManage, symbol, today }: {
  groups: { id: number; code: string; name: string; isActive: boolean; customers: number }[]; products: Product[];
  prices: { groupId: number; productId: number; price: string }[]; canManage: boolean; symbol: string; today: string;
}) {
  const [edit, setEdit] = React.useState<{ groupId: number; productId: number; price: string } | null>(null);
  const [ng, setNg] = React.useState({ code: "", name: "" });
  const save = useAction(setGroupPriceAction, { success: "Group price saved", onSuccess: () => setEdit(null) });
  const add = useAction(saveGroupAction, { success: "Group created", onSuccess: () => setNg({ code: "", name: "" }) });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" />Customer groups</CardTitle><CardDescription>A group price applies to group members who have no own price (e.g. shops, offices, resellers).</CardDescription></CardHeader>
      <CardContent className="px-0 pb-3">
        <Table>
          <THead><TR><TH>Group</TH><TH className="text-right">Customers</TH>{products.map(p => <TH key={p.id} className="text-right">{p.name}</TH>)}</TR></THead>
          <TBody>{groups.map(g => (
            <TR key={g.id}><TD className="font-medium">{g.name}<p className="text-xs text-muted-foreground">{g.code}</p></TD><TD className="text-right">{g.customers}</TD>
              {products.map(p => { const x = prices.find(y => y.groupId === g.id && y.productId === p.id); return (
                <TD key={p.id} className="text-right"><button type="button" disabled={!canManage} onClick={() => setEdit({ groupId: g.id, productId: p.id, price: x ? Number(x.price).toString() : "" })} className={cn("rounded-md px-2 py-1 tabular", canManage && "hover:bg-accent", !x && "text-muted-foreground")}>{x ? formatPrice(x.price, symbol) : "default"}</button></TD>
              ); })}
            </TR>
          ))}</TBody>
        </Table>
        {canManage && (
          <form className="mx-5 mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); add.run(ng); }}>
            <Input className="w-32" placeholder="Code" value={ng.code} onChange={e => setNg({ ...ng, code: e.target.value })} /><Input className="w-56" placeholder="Group name" value={ng.name} onChange={e => setNg({ ...ng, name: e.target.value })} /><Button type="submit" variant="outline" loading={add.busy}>Add group</Button>
            {add.error && <p className="w-full text-sm text-destructive">{add.error}</p>}
          </form>
        )}
      </CardContent>
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        {edit && <DialogContent title="Group price" description="Leave empty and save to remove the group price.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ groupId: edit.groupId, productId: edit.productId, price: edit.price === "" ? null : edit.price, effectiveFrom: today }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <Field label={`Price (${symbol})`}><Input autoFocus inputMode="decimal" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={save.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>}
      </Dialog>
    </Card>
  );
}
