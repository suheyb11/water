"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Checkbox, Field, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { stockMoveAction } from "@/app/actions/mutations";
import { MANUAL_STOCK_TYPES, STOCK_MOVE_TYPES, type StockMoveType } from "@/lib/constants";

export function StockForm({ products, today, canNegative }: { products: { id: number; name: string }[]; today: string; canNegative: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ productId: products[0] ? String(products[0].id) : "", type: "PRODUCTION" as StockMoveType, quantity: "", date: today, reference: "", unitCost: "", notes: "", allowNegative: false });
  const save = useAction(stockMoveAction, { success: "Stock movement recorded", onSuccess: () => { setOpen(false); setF(x => ({ ...x, quantity: "", reference: "", notes: "", unitCost: "" })); } });
  const sel = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs";
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Record movement</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record stock movement" description="Sales, returns and cancellations move stock automatically — use this for production, purchases, damage and counts.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ productId: Number(f.productId), type: f.type, quantity: Number(f.quantity), date: f.date, reference: f.reference || null, unitCost: f.unitCost ? Number(f.unitCost) : null, notes: f.notes || null, allowNegative: f.allowNegative }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product"><select className={sel} value={f.productId} onChange={e => setF({ ...f, productId: e.target.value })}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Movement"><select className={sel} value={f.type} onChange={e => setF({ ...f, type: e.target.value as StockMoveType })}>{MANUAL_STOCK_TYPES.map(t => <option key={t} value={t}>{STOCK_MOVE_TYPES[t].label}</option>)}</select></Field>
              <Field label="Quantity *" error={save.errors.quantity}><Input autoFocus inputMode="decimal" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field>
              <Field label="Date"><Input type="date" value={f.date} max={today} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Reference"><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} placeholder="Batch / delivery note" /></Field>
              <Field label="Unit cost (optional)"><Input inputMode="decimal" value={f.unitCost} onChange={e => setF({ ...f, unitCost: e.target.value })} /></Field>
            </div>
            <Field label="Notes"><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
            {canNegative && <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.allowNegative} onCheckedChange={c => setF({ ...f, allowNegative: !!c })} />Allow stock to go below zero (authorised override)</label>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
