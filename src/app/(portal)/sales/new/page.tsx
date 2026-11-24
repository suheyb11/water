import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { listDeliveryStaff } from "@/server/services/users";
import { PageHeader, idOf } from "@/components/common";
import { addressLine } from "@/lib/address";
import { D } from "@/lib/money";
import { todayIso } from "@/lib/dates";
import { Pos } from "./pos";

export const metadata = { title: "New sale" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const actor = await requirePage("sales.create");
  const { customer } = await searchParams;
  const p = actor.permissions;
  const [s, products, methods, drivers, c] = await Promise.all([
    getSettings(),
    prisma.product.findMany({ where: { status: "ACTIVE" }, include: { stock: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    listPaymentMethods(),
    p.has("deliveries.manage") ? listDeliveryStaff() : Promise.resolve([]),
    customer ? prisma.customer.findUnique({ where: { id: (idOf(customer) ?? -1) }, include: { addresses: { where: { isPrimary: true, isActive: true }, include: { district: true, neighborhood: true, place: true } } } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="New sale" description="Customer → products → payment. Prices come from the customer's own price list, then group, then the default price." />
      <Pos
        products={products.map(x => ({ id: x.id, code: x.code, name: x.name, capacity: x.capacity.toString(), capacityUnit: x.capacityUnit, saleUnit: x.saleUnit, onHand: x.trackStock ? D(x.stock?.onHand ?? 0).toString() : null }))}
        methods={methods.map(m => ({ id: m.id, name: m.name, kind: m.kind }))}
        drivers={drivers}
        initialCustomer={c && c.status === "ACTIVE" ? { id: c.id, code: c.code, name: c.name, phone: c.phone, balance: D(c.balance).toFixed(2), address: addressLine(c.addresses[0]) } : null}
        perms={{ discount: p.has("sales.discount"), override: p.has("sales.override_price"), backdate: p.has("sales.backdate"), pay: p.has("payments.create"), delivery: p.has("deliveries.manage"), newCustomer: p.has("customers.manage"), remind: p.has("reminders.manage") }}
        symbol={s.currencySymbol} today={todayIso()}
      />
    </>
  );
}
