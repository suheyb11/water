"use client";
import * as React from "react";
import Link from "next/link";
import { Ban, FileDown, MinusCircle, Printer, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Checkbox, Field, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { cancelInvoiceAction, creditAdjustmentAction, returnAction } from "@/app/actions/mutations";
import { formatMoney } from "@/lib/money";

export function InvoiceActions({ invoice, items, perms, symbol }: {
  invoice: { id: number; number: string; customerId: number; kind: string; status: string; outstanding: string };
  items: { id: number; name: string; quantity: string; returned: string; unitPrice: string }[];
  perms: { pay: boolean; cancel: boolean; adjust: boolean }; symbol: string;
}) {
  const [dlg, setDlg] = React.useState<null | "cancel" | "return" | "credit">(null);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [ret, setRet] = React.useState<Record<number, { q: string; restock: boolean }>>({});
  const close = () => { setDlg(null); setReason(""); setAmount(""); setRet({}); };
  const cancel = useAction(cancelInvoiceAction, { success: `${invoice.number} cancelled`, onSuccess: close });
  const doReturn = useAction(returnAction, { success: d => `Return ${d.number} posted`, onSuccess: close });
  const credit = useAction(creditAdjustmentAction, { success: d => `Credit note ${d.number} posted`, onSuccess: close });
  const open = invoice.status !== "CANCELLED";
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}><Printer />Print</Button>
      <Button variant="outline" asChild><a href={`/api/pdf/invoice/${invoice.id}`} target="_blank" rel="noreferrer"><FileDown />PDF</a></Button>
      {perms.pay && open && Number(invoice.outstanding) > 0 && <Button asChild><Link href={`/payments/new?customer=${invoice.customerId}&invoice=${invoice.id}`}><Wallet />Record payment</Link></Button>}
      {perms.adjust && open && invoice.kind === "SALE" && <Button variant="outline" onClick={() => setDlg("return")}><Undo2 />Return</Button>}
      {perms.adjust && open && invoice.kind !== "REFUND" && <Button variant="outline" onClick={() => setDlg("credit")}><MinusCircle />Price adjustment</Button>}
      {perms.cancel && open && invoice.kind !== "REFUND" && <Button variant="outline" className="text-destructive" onClick={() => setDlg("cancel")}><Ban />Cancel</Button>}

      <Dialog open={dlg === "cancel"} onOpenChange={o => !o && close()}>
        <DialogContent title={`Cancel ${invoice.number}?`} description="The invoice stays on file marked Cancelled. Its debit is reversed in the ledger, payments applied to it become customer credit (and settle other open invoices), and the stock comes back.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); cancel.run({ invoiceId: invoice.id, reason }); }}>
            {cancel.error && <Alert tone="danger" title={cancel.error} />}
            <Field label="Reason *" error={cancel.errors.reason}><Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Wrong customer / entered twice / …" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={close}>Keep invoice</Button><Button type="submit" variant="destructive" loading={cancel.busy}>Cancel invoice</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "return"} onOpenChange={o => !o && close()}>
        <DialogContent wide title={`Return products from ${invoice.number}`} description="Credited at the price on this invoice. Ticked lines go back into stock.">
          <form className="grid gap-4" onSubmit={e => {
            e.preventDefault();
            doReturn.run({ invoiceId: invoice.id, reason, items: Object.entries(ret).filter(([, v]) => Number(v.q) > 0).map(([id, v]) => ({ invoiceItemId: Number(id), quantity: v.q, restock: v.restock })) });
          }}>
            {doReturn.error && <Alert tone="danger" title={doReturn.error} />}
            <Table>
              <THead><TR><TH>Product</TH><TH className="text-right">Sold</TH><TH className="text-right">Returned</TH><TH>Return now</TH><TH>Back to stock</TH></TR></THead>
              <TBody>{items.map(i => {
                const v = ret[i.id] ?? { q: "", restock: true };
                return (
                  <TR key={i.id}><TD>{i.name}<p className="text-xs text-muted-foreground">{formatMoney(i.unitPrice, symbol)} each</p></TD><TD className="text-right tabular">{Number(i.quantity)}</TD><TD className="text-right tabular">{Number(i.returned)}</TD>
                    <TD><Input className="h-8 w-24" inputMode="decimal" value={v.q} onChange={e => setRet(r => ({ ...r, [i.id]: { ...v, q: e.target.value } }))} aria-label={`Return quantity ${i.name}`} /></TD>
                    <TD><Checkbox checked={v.restock} onCheckedChange={c => setRet(r => ({ ...r, [i.id]: { ...v, restock: !!c } }))} aria-label="Back to stock" /></TD></TR>
                );
              })}</TBody>
            </Table>
            <Field label="Reason *" error={doReturn.errors.reason}><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Leaking container / wrong product / …" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={doReturn.busy}>Post return</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "credit"} onOpenChange={o => !o && close()}>
        <DialogContent title="Price adjustment (credit)" description={`Lowers what the customer owes on ${invoice.number} as a separate credit note. The invoice itself is not changed.`}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); credit.run({ customerId: invoice.customerId, invoiceId: invoice.id, amount, reason }); }}>
            {credit.error && <Alert tone="danger" title={credit.error} />}
            <Field label={`Amount (${symbol})`} error={credit.errors.amount}><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
            <Field label="Reason *" error={credit.errors.reason}><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Agreed price was 0.85, not 1.00" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" loading={credit.busy}>Post credit note</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
