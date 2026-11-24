import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth/session";
import { getCustomer } from "@/server/services/customers";
import { getSettings, listGroups } from "@/server/services/settings";
import { PageHeader, idOf } from "@/components/common";
import { isoOf, todayIso } from "@/lib/dates";
import { CustomerForm } from "../../customer-form";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("customers.manage");
  const c = await getCustomer((idOf((await params).id) ?? -1));
  if (!c) notFound();
  const [s, groups] = await Promise.all([getSettings(), listGroups(false)]);
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} description="Addresses and prices are changed on the customer page; financial history cannot be edited." />
      <CustomerForm mode="edit" customerId={c.id} products={[]} locations={[]} groups={groups.map(g => ({ id: g.id, name: g.name }))} canPrice={false} canOpening={false} symbol={s.currencySymbol} today={todayIso()}
        initial={{ name: c.name, phone: c.phone, altPhone: c.altPhone ?? "", customerType: c.customerType, groupId: c.groupId ? String(c.groupId) : "", status: c.status, registeredOn: isoOf(c.registeredOn), creditLimit: c.creditLimit?.toString() ?? "", notes: c.notes ?? "" }} />
    </>
  );
}
