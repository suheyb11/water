"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Minus, Plus, Truck, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Field, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { CustomerPicker, useAction, type PickedCustomer } from "@/components/client-kit";
import { createDeliveryAction, deliveryStatusAction } from "@/app/actions/mutations";
import { DELIVERY_TRANSITIONS, type DeliveryStatus } from "@/lib/constants";

export function NewDeliveryForm({ products, drivers, today }: { products: { id: number; name: string }[]; drivers: { id: number; fullName: string }[]; today: string }) {
  const router = useRouter();
  const [customer, setCustomer] = React.useState<PickedCustomer | null>(null);
  const [items, setItems] = React.useState<Record<number, string>>(products[0] ? { [products[0].id]: "1" } : {});
  const [date, setDate] = React.useState(today);
  const [driver, setDriver] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const save = useAction(createDeliveryAction, { success: d => `Delivery ${d.number} created`, onSuccess: d => router.push(`/deliveries/${d.id}`) });
  return (
    <Card><CardContent className="grid gap-4 pt-5">
      <CustomerPicker value={customer} onChange={setCustomer} autoFocus />
      <div className="grid gap-2">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5">
            <span className="flex-1 text-sm font-medium">{p.name}</span>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setItems(i => ({ ...i, [p.id]: String(Math.max(0, Number(i[p.id] || 0) - 1)) }))} aria-label="Less"><Minus /></Button>
            <Input className="h-8 w-16 text-center" inputMode="decimal" value={items[p.id] ?? ""} onChange={e => setItems(i => ({ ...i, [p.id]: e.target.value }))} aria-label={`Quantity ${p.name}`} />
            <Button size="icon" variant="outline" className="size-8" onClick={() => setItems(i => ({ ...i, [p.id]: String(Number(i[p.id] || 0) + 1) }))} aria-label="More"><Plus /></Button>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Delivery date"><Input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Driver"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={driver} onChange={e => setDriver(e.target.value)}><option value="">Assign later</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>
        <Field label="Notes"><Input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      <Alert tone="info" title="Invoiced on delivery">The sale is posted (at the customer&apos;s price on that day) when the delivery is marked Delivered — once, never twice. To invoice first, use New sale → “Deliver this order”.</Alert>
      {save.error && <Alert tone="danger" title={save.error} />}
      <div className="flex justify-end"><Button loading={save.busy} disabled={!customer} onClick={() => save.run({ customerId: customer!.id, scheduledDate: date, assignedToId: driver || null, notes: notes || null, items: Object.entries(items).filter(([, q]) => Number(q) > 0).map(([productId, quantity]) => ({ productId: Number(productId), quantity })) })}><Truck />Create delivery</Button></div>
    </CardContent></Card>
  );
}

export function DeliveryActions({ id, status, invoiced, isManager, isMine, drivers, methods, symbol }: { id: number; status: DeliveryStatus; invoiced: boolean; isManager: boolean; isMine: boolean; drivers: { id: number; fullName: string }[]; methods: { id: number; name: string }[]; symbol: string }) {
  const [dlg, setDlg] = React.useState<DeliveryStatus | null>(null);
  const [f, setF] = React.useState({ note: "", failureReason: "", receivedBy: "", driver: "", amount: "", methodId: methods[0] ? String(methods[0].id) : "", reference: "" });
  const act = useAction(deliveryStatusAction, { success: d => `Delivery is now ${d.status.replaceAll("_", " ").toLowerCase()}`, onSuccess: () => setDlg(null) });
  const next = DELIVERY_TRANSITIONS[status].filter(s => isManager || (isMine && !["ASSIGNED", "PENDING", "CANCELLED"].includes(s)));
  if (!isManager && !isMine) return null;
  const btn: Record<string, { label: string; icon: React.ReactNode; variant?: "outline" | "destructive" }> = {
    ASSIGNED: { label: "Assign driver", icon: <UserCheck />, variant: "outline" }, OUT_FOR_DELIVERY: { label: "Out for delivery", icon: <Truck /> },
    DELIVERED: { label: "Delivered", icon: <CheckCircle2 /> }, FAILED: { label: "Failed", icon: <XCircle />, variant: "outline" },
    CANCELLED: { label: "Cancel", icon: <Ban />, variant: "outline" }, PENDING: { label: "Unassign", icon: <UserCheck />, variant: "outline" },
  };
  return (
    <div className="flex flex-wrap gap-2">
      {next.map(s => <Button key={s} variant={btn[s].variant} onClick={() => setDlg(s)}>{btn[s].icon}{btn[s].label}</Button>)}
      <Dialog open={!!dlg} onOpenChange={o => !o && setDlg(null)}>
        {dlg && <DialogContent title={btn[dlg].label} description={dlg === "DELIVERED" && !invoiced ? "The sale is posted now at the customer's current price (invoice, ledger and stock). Enter any money collected." : undefined}>
          <form className="grid gap-4" onSubmit={e => {
            e.preventDefault();
            act.run({ deliveryId: id, status: dlg, note: f.note || null, failureReason: f.failureReason || null, receivedBy: f.receivedBy || null, assignedToId: f.driver || null,
              payment: dlg === "DELIVERED" && !invoiced && f.amount ? { amount: f.amount, methodId: Number(f.methodId), reference: f.reference || null } : null });
          }}>
            {act.error && <Alert tone="danger" title={act.error} />}
            {dlg === "ASSIGNED" && <Field label="Driver" error={act.errors.assignedToId}><select className="h-9 rounded-md border bg-card px-2 text-sm" value={f.driver} onChange={e => setF({ ...f, driver: e.target.value })}><option value="">Choose…</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></Field>}
            {dlg === "FAILED" && <Field label="Why did it fail? *" error={act.errors.failureReason}><Input autoFocus value={f.failureReason} onChange={e => setF({ ...f, failureReason: e.target.value })} placeholder="Customer not at home / wrong address" /></Field>}
            {dlg === "DELIVERED" && <Field label="Received by"><Input value={f.receivedBy} onChange={e => setF({ ...f, receivedBy: e.target.value })} placeholder="Name of the person" /></Field>}
            {dlg === "DELIVERED" && !invoiced && <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`Cash collected (${symbol})`}><Input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Field>
              <Field label="Method"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={f.methodId} onChange={e => setF({ ...f, methodId: e.target.value })}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              <Field label="Reference"><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
            </div>}
            <Field label="Note"><Input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDlg(null)}>Back</Button><Button type="submit" loading={act.busy}>Confirm</Button></DialogFooter>
          </form>
        </DialogContent>}
      </Dialog>
    </div>
  );
}
