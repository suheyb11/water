import { requirePage } from "@/server/auth/session";
import { PageHeader } from "@/components/common";
import { prisma } from "@/server/db";
import { getSettings, listGroups } from "@/server/services/settings";
import { locationOptions } from "@/server/services/locations";
import { defaultPriceAt } from "@/server/services/pricing";
import { dbDate, todayIso } from "@/lib/dates";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Register customer" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const actor = await requirePage("customers.manage");
  const { returnTo } = await searchParams;
  const today = todayIso();
  const [s, groups, locations, products] = await Promise.all([
    getSettings(), listGroups(), locationOptions(),
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const productOpts = await Promise.all(products.map(async p => ({
    id: p.id, name: p.name, capacity: p.capacity.toString(), capacityUnit: p.capacityUnit, saleUnit: p.saleUnit,
    defaultPrice: (await defaultPriceAt(prisma, p.id, dbDate(today))).price.toFixed(4),
  })));
  return (
    <>
      <PageHeader title="Register customer" description="Details → local address → special prices → save. Prices are applied automatically on every future sale." />
      <CustomerForm mode="new" products={productOpts} groups={groups.map(g => ({ id: g.id, name: g.name }))} locations={locations}
        canPrice={actor.permissions.has("pricing.manage")} canOpening={actor.permissions.has("ledger.adjust")} symbol={s.currencySymbol} today={today}
        returnTo={returnTo?.startsWith("/") ? returnTo : undefined} />
    </>
  );
}
