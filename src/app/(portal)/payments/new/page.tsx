import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { PageHeader, idOf } from "@/components/common";
import { addressLine } from "@/lib/address";
import { D } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { PaymentForm } from "./payment-form";

export const metadata = { title: "Receive payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ customer?: string; invoice?: string }> }) {
  const actor = await requirePage("payments.create");
  const sp = await searchParams;
  const [s, methods, c] = await Promise.all([
    getSettings(), listPaymentMethods(),
    sp.customer ? prisma.customer.findUnique({ where: { id: (idOf(sp.customer) ?? -1) }, include: { addresses: { where: { isPrimary: true, isActive: true }, include: { district: true, neighborhood: true, place: true } } } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="Receive payment" description="Full, partial, several invoices or in advance. The payment is credited once; allocation only says which invoices it settles." />
      <PaymentForm methods={methods.map(m => ({ id: m.id, name: m.name }))} symbol={s.currencySymbol} today={todayIso()} canBackdate={actor.permissions.has("sales.backdate")}
        focusInvoiceId={sp.invoice ? (idOf(sp.invoice) ?? -1) : undefined}
        initialCustomer={c ? { id: c.id, code: c.code, name: c.name, phone: c.phone, balance: D(c.balance).toFixed(2), address: addressLine(c.addresses[0]) } : null} />
    </>
  );
}
