"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, MinusCircle, Pencil, Plus, PlusCircle, Star, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Checkbox, Field, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { AddressFields, addressPayload, emptyAddress, type AddressValue, type LocOpt } from "@/components/address-fields";
import { useAction } from "@/components/client-kit";
import { applyCreditAction, creditAdjustmentAction, debitNoteAction, refundAction, removeAddressAction, removeCustomerPriceAction, saveAddressAction, setCustomerPriceAction } from "@/app/actions/mutations";
import { PRICE_SOURCES, type PriceSource } from "@/lib/constants";
import { formatMoney, formatPrice } from "@/lib/money";

// ───────── prices ─────────
export interface PriceRow { productId: number; name: string; capacity: string; capacityUnit: string; saleUnit: string; defaultPrice: string; price: string; source: PriceSource; priceId: number | null; effectiveTo: string | null }

export function PriceEditor({ customerId, rows, canManage, symbol, today }: { customerId: number; rows: PriceRow[]; canManage: boolean; symbol: string; today: string }) {
  const [edit, setEdit] = React.useState<PriceRow | null>(null);
  const [remove, setRemove] = React.useState<PriceRow | null>(null);
  const [form, setForm] = React.useState({ price: "", from: today, temporary: false, to: "", reason: "" });
  const save = useAction(setCustomerPriceAction, { success: "Price saved — new sales use it from the effective date", onSuccess: () => setEdit(null) });
  const del = useAction(removeCustomerPriceAction, { success: "Special price removed" });
  const open = (r: PriceRow) => { setForm({ price: r.source.startsWith("CUSTOMER") ? Number(r.price).toString() : "", from: today, temporary: false, to: "", reason: "" }); setEdit(r); };
  return (
    <>
      <Table>
        <THead><TR><TH>Product</TH><TH className="text-right">Default price</TH><TH className="text-right">Price this customer pays</TH><TH>Source</TH>{canManage && <TH className="w-40" />}</TR></THead>
        <TBody>
          {rows.map(r => (
            <TR key={r.productId}>
              <TD><span className="font-medium">{r.name}</span><p className="text-xs text-muted-foreground">{Number(r.capacity)} {r.capacityUnit} · per {r.saleUnit}</p></TD>
              <TD className="text-right tabular text-muted-foreground">{formatPrice(r.defaultPrice, symbol)}</TD>
              <TD className="text-right tabular text-base font-semibold">{formatPrice(r.price, symbol)}</TD>
              <TD><Badge tone={r.source === "DEFAULT" ? "outline" : r.source === "CUSTOMER_TEMP" ? "warning" : "primary"}>{PRICE_SOURCES[r.source]}</Badge>{r.effectiveTo && <p className="mt-0.5 text-xs text-muted-foreground">until {r.effectiveTo}</p>}</TD>
              {canManage && <TD className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => open(r)}><Pencil />Change</Button>
                  {r.priceId && <Button size="sm" variant="ghost" onClick={() => setRemove(r)} aria-label="Remove special price"><Trash2 /></Button>}
                </div>
              </TD>}
            </TR>
          ))}
        </TBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={`Price of ${edit.name}`} description={`Default ${formatPrice(edit.defaultPrice, symbol)}. Posted invoices keep their own price; this only affects sales from the effective date.`}>
            <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ customerId, productId: edit.productId, price: form.price, effectiveFrom: form.from, temporary: form.temporary, effectiveTo: form.temporary ? form.to : null, reason: form.reason || null }); }}>
              {save.error && <Alert tone="danger" title={save.error} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`New price (${symbol})`} error={save.errors.price}><Input autoFocus inputMode="decimal" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.85" /></Field>
                <Field label="Effective from"><Input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.temporary} onCheckedChange={c => setForm(f => ({ ...f, temporary: !!c }))} />Temporary price (promotion) — returns to the normal price after the end date</label>
              {form.temporary && <Field label="Last day + 1 (end date)" error={save.errors.effectiveTo}><Input type="date" value={form.to} min={form.from} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} /></Field>}
              <Field label="Reason (optional)"><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Agreed new price" /></Field>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={save.busy}>Save price</Button></DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog open={!!remove} onOpenChange={o => !o && setRemove(null)} title="Remove special price?" description={remove ? `${remove.name}: from today this customer pays the group/default price. The history is kept.` : ""} confirmLabel="Remove" destructive
        onConfirm={async () => { if (remove?.priceId) await del.run(remove.priceId, "Removed on customer page"); }} />
    </>
  );
}

// ───────── addresses ─────────
export interface AddressRow extends AddressValue { id: number; text: string; isPrimary: boolean }

export function AddressManager({ customerId, rows, locations, canManage }: { customerId: number; rows: AddressRow[]; locations: LocOpt[]; canManage: boolean }) {
  const [edit, setEdit] = React.useState<AddressValue | null>(null);
  const [del, setDel] = React.useState<AddressRow | null>(null);
  const save = useAction(saveAddressAction, { success: "Address saved", onSuccess: () => setEdit(null) });
  const remove = useAction(removeAddressAction, { success: "Address removed" });
  return (
    <div className="grid gap-3">
      {rows.map(a => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{a.localName} {a.isPrimary && <Badge tone="primary" className="ml-1">Main</Badge>}</p>
            <p className="text-muted-foreground">{a.text}</p>
            {a.description && <p className="text-muted-foreground">{a.description}</p>}
            {a.deliveryInstructions && <p className="text-muted-foreground">Delivery: {a.deliveryInstructions}</p>}
            {a.latitude && a.longitude && <a className="text-xs text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=18/${a.latitude}/${a.longitude}`}>GPS {a.latitude}, {a.longitude} — open map</a>}
          </div>
          {canManage && <div className="flex gap-1">
            {!a.isPrimary && <Button size="icon" variant="ghost" title="Make main address" onClick={() => save.run(customerId, addressPayload({ ...a, isPrimary: true }))}><Star /></Button>}
            <Button size="icon" variant="ghost" title="Edit" onClick={() => setEdit(a)}><Pencil /></Button>
            {rows.length > 1 && <Button size="icon" variant="ghost" title="Remove" onClick={() => setDel(a)}><Trash2 /></Button>}
          </div>}
        </div>
      ))}
      {canManage && <Button variant="outline" className="justify-self-start" onClick={() => setEdit({ ...emptyAddress, isPrimary: false, label: "Other" })}><Plus />Add address</Button>}
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        {edit && <DialogContent wide title={edit.id ? "Edit address" : "Add address"}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run(customerId, addressPayload(edit)); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <AddressFields value={edit} onChange={setEdit} locations={locations} errors={save.errors} prefix="" />
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!edit.isPrimary} onCheckedChange={c => setEdit({ ...edit, isPrimary: !!c })} />Main address (used on invoices and deliveries)</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={save.busy}>Save address</Button></DialogFooter>
          </form>
        </DialogContent>}
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={o => !o && setDel(null)} title="Remove this address?" description={del?.localName} destructive confirmLabel="Remove" onConfirm={async () => { if (del) await remove.run(customerId, del.id); }} />
    </div>
  );
}

// ───────── account actions ─────────
export function AccountActions({ customerId, balance, freeCredit, hasOpen, methods, perms, symbol, invoices }: {
  customerId: number; balance: string; freeCredit: string; hasOpen: boolean; methods: { id: number; name: string }[];
  perms: { adjust: boolean; pay: boolean }; symbol: string; invoices: { id: number; number: string }[];
}) {
  const router = useRouter();
  const [dlg, setDlg] = React.useState<null | "debit" | "credit" | "refund">(null);
  const [f, setF] = React.useState({ amount: "", reason: "", invoiceId: "", methodId: methods[0] ? String(methods[0].id) : "", reference: "" });
  const close = () => { setDlg(null); setF(x => ({ ...x, amount: "", reason: "", invoiceId: "", reference: "" })); };
  const debit = useAction(debitNoteAction, { success: d => `Debit note ${d.number} posted`, onSuccess: close });
  const credit = useAction(creditAdjustmentAction, { success: d => `Credit note ${d.number} posted`, onSuccess: close });
  const refund = useAction(refundAction, { success: "Refund recorded", onSuccess: close });
  const apply = useAction(applyCreditAction, { success: d => `Applied ${formatMoney(d as unknown as string, symbol)} of credit to open invoices` });
  const cur = dlg === "debit" ? debit : dlg === "credit" ? credit : refund;
  const sel = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs";
  return (
    <div className="flex flex-wrap gap-2">
      {perms.pay && Number(freeCredit) > 0 && hasOpen && <Button variant="outline" size="sm" loading={apply.busy} onClick={() => apply.run(customerId)}><Wand2 />Apply {formatMoney(freeCredit, symbol)} credit</Button>}
      {perms.adjust && <>
        <Button variant="outline" size="sm" onClick={() => setDlg("debit")}><PlusCircle />Charge / debit</Button>
        <Button variant="outline" size="sm" onClick={() => setDlg("credit")}><MinusCircle />Credit adjustment</Button>
        {Number(balance) < 0 && <Button variant="outline" size="sm" onClick={() => setDlg("refund")}><Undo2 />Refund credit</Button>}
      </>}
      <Dialog open={!!dlg} onOpenChange={o => !o && close()}>
        {dlg && <DialogContent title={dlg === "debit" ? "Charge or debit adjustment" : dlg === "credit" ? "Credit adjustment" : "Refund customer credit"}
          description={dlg === "debit" ? "Adds to what the customer owes (extra charge, price correction upwards). Posted as its own document." : dlg === "credit" ? "Lowers what the customer owes (price agreed after invoicing, goodwill, write-off). The original invoice stays as it was." : `Pay money back from the customer's advance credit (${formatMoney(Math.abs(Number(balance)), symbol)} available on the account).`}>
          <form className="grid gap-4" onSubmit={e => {
            e.preventDefault();
            if (dlg === "debit") debit.run({ customerId, amount: f.amount, reason: f.reason, relatedInvoiceId: f.invoiceId ? Number(f.invoiceId) : null });
            if (dlg === "credit") credit.run({ customerId, amount: f.amount, reason: f.reason, invoiceId: f.invoiceId ? Number(f.invoiceId) : null });
            if (dlg === "refund") refund.run({ customerId, amount: f.amount, reason: f.reason, methodId: Number(f.methodId), reference: f.reference || null });
          }}>
            {cur.error && <Alert tone="danger" title={cur.error} />}
            <Field label={`Amount (${symbol})`} error={cur.errors.amount}><Input autoFocus inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
            {dlg !== "refund" && invoices.length > 0 && <Field label="Related invoice (optional)"><select className={sel} value={f.invoiceId} onChange={e => setF({ ...f, invoiceId: e.target.value })}><option value="">—</option>{invoices.map(i => <option key={i.id} value={i.id}>{i.number}</option>)}</select></Field>}
            {dlg === "refund" && <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid back by"><select className={sel} value={f.methodId} onChange={e => setF({ ...f, methodId: e.target.value })}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              <Field label="Reference"><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
            </div>}
            <Field label="Reason *" error={cur.errors.reason}><Input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={cur.busy}>Post</Button></DialogFooter>
          </form>
        </DialogContent>}
      </Dialog>
      <span className="hidden" onClick={() => router.refresh()} />
    </div>
  );
}

export function TempBadge() { return <CalendarClock className="size-3.5" />; }
