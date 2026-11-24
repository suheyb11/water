"use client";
import * as React from "react";
import { CustomerPicker, useQueryNav, type PickedCustomer } from "@/components/client-kit";

export function StatementCustomer({ initial }: { initial: PickedCustomer | null }) {
  const nav = useQueryNav();
  const [c, setC] = React.useState(initial);
  return <div className="max-w-xl flex-1"><CustomerPicker value={c} onChange={x => { setC(x); nav({ customer: x ? String(x.id) : null }); }} autoFocus={!initial} /></div>;
}
