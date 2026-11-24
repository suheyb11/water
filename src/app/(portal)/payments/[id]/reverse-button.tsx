"use client";
import * as React from "react";
import { FileDown, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { reversePaymentAction } from "@/app/actions/mutations";

export function PaymentActions({ id, number, canReverse }: { id: number; number: string; canReverse: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const rev = useAction(reversePaymentAction, { success: `${number} reversed`, onSuccess: () => setOpen(false) });
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}><Printer />Print</Button>
      <Button variant="outline" asChild><a href={`/api/pdf/receipt/${id}`} target="_blank" rel="noreferrer"><FileDown />PDF</a></Button>
      {canReverse && <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}><RotateCcw />Reverse</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Reverse ${number}?`} description="Use this when money did not arrive or the payment was entered by mistake. The receipt stays on file marked Reversed, the ledger is debited back and the invoices it paid are re-opened.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); rev.run({ paymentId: id, reason }); }}>
            {rev.error && <Alert tone="danger" title={rev.error} />}
            <Field label="Reason *" error={rev.errors.reason}><Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="EVC transfer not received / entered twice" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep</Button><Button type="submit" variant="destructive" loading={rev.busy}>Reverse payment</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
