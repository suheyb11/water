"use client";
import * as React from "react";
import { Ban, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { recordExpenseAction, saveExpenseCategoryAction, voidExpenseAction } from "@/app/actions/mutations";

const sel = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs";

export function NewExpense({ categories, methods, today, symbol, canBackdate }: { categories: { id: number; name: string }[]; methods: { id: number; name: string }[]; today: string; symbol: string; canBackdate: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ categoryId: categories[0] ? String(categories[0].id) : "", description: "", amount: "", methodId: methods[0] ? String(methods[0].id) : "", date: today, reference: "", payee: "" });
  const save = useAction(recordExpenseAction, { success: d => `Expense ${d.number} recorded`, onSuccess: () => { setOpen(false); setF(x => ({ ...x, description: "", amount: "", reference: "", payee: "" })); } });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Record expense</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record expense">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ categoryId: Number(f.categoryId), description: f.description, amount: f.amount, methodId: Number(f.methodId), expenseDate: f.date, reference: f.reference || null, payee: f.payee || null }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category"><select className={sel} value={f.categoryId} onChange={e => setF({ ...f, categoryId: e.target.value })}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label={`Amount (${symbol}) *`} error={save.errors.amount}><Input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
            </div>
            <Field label="Description *" error={save.errors.description}><Input autoFocus value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Diesel for delivery truck" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid with"><select className={sel} value={f.methodId} onChange={e => setF({ ...f, methodId: e.target.value })}>{methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
              <Field label="Date"><Input type="date" value={f.date} max={today} disabled={!canBackdate} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Paid to"><Input value={f.payee} onChange={e => setF({ ...f, payee: e.target.value })} /></Field>
              <Field label="Reference"><Input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function VoidExpense({ id, number }: { id: number; number: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const v = useAction(voidExpenseAction, { success: `${number} voided`, onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Void ${number}`}><Ban /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Void ${number}?`} description="The expense stays on file marked Void and drops out of all totals.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); v.run(id, reason); }}>
            {v.error && <Alert tone="danger" title={v.error} />}
            <Field label="Reason *"><Input autoFocus value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep</Button><Button type="submit" variant="destructive" loading={v.busy}>Void</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Categories({ categories }: { categories: { id: number; name: string; isActive: boolean }[] }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const save = useAction(saveExpenseCategoryAction, { success: "Category saved", onSuccess: () => setName("") });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Tag />Categories</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Expense categories">
          <ul className="grid gap-1.5">{categories.map(c => (
            <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"><span className={c.isActive ? "" : "text-muted-foreground line-through"}>{c.name}</span>
              <Button size="sm" variant="ghost" onClick={() => save.run({ id: c.id, name: c.name, isActive: !c.isActive })}>{c.isActive ? "Disable" : "Enable"}</Button></li>
          ))}</ul>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); save.run({ name }); }}>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="New category" /><Button type="submit" loading={save.busy}>Add</Button>
          </form>
          {save.error && <Alert tone="danger" title={save.error} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
