import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { priceMatrix } from "@/server/services/pricing";
import { getSettings, listGroups } from "@/server/services/settings";
import { PageHeader, Pager, pageOf, idOf } from "@/components/common";
import { SearchInput, SelectFilter } from "@/components/client-kit";
import { dbDate, todayIso } from "@/lib/dates";
import { GroupsPanel, PricingGrid } from "./pricing-grid";

export const metadata = { title: "Pricing" };
const PAGE = 50;

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("pricing.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const today = todayIso();
  const [m, s, groups, gp, counts] = await Promise.all([
    priceMatrix({ q: sp.q, groupId: sp.group ? (idOf(sp.group) ?? -1) : undefined, onlySpecial: sp.only === "special", take: PAGE, skip: (page - 1) * PAGE }),
    getSettings(), listGroups(false),
    prisma.groupProductPrice.findMany({ where: { isActive: true, effectiveFrom: { lte: dbDate(today) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: dbDate(today) } }] }, orderBy: { effectiveFrom: "desc" } }),
    prisma.customer.groupBy({ by: ["groupId"], _count: { _all: true } }),
  ]);
  const canManage = actor.permissions.has("pricing.manage");
  return (
    <>
      <PageHeader title="Pricing" description="What every customer pays today. Click a price to change it, or tick customers for a bulk change. Priority: own price → group price → default price." />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput placeholder="Customer name, phone, code" />
        <SelectFilter name="only" placeholder="All active customers" options={[{ value: "special", label: "Only customers with own prices" }]} />
        {groups.length > 0 && <SelectFilter name="group" placeholder="All groups" options={groups.map(g => ({ value: String(g.id), label: g.name }))} />}
      </div>
      <PricingGrid products={m.products} rows={m.rows} canManage={canManage} symbol={s.currencySymbol} today={today} />
      <Pager total={m.total} page={page} pageSize={PAGE} params={sp} basePath="/pricing" />
      <div className="mt-6">
        <GroupsPanel canManage={canManage} symbol={s.currencySymbol} today={today} products={m.products}
          groups={groups.map(g => ({ id: g.id, code: g.code, name: g.name, isActive: g.isActive, customers: counts.find(c => c.groupId === g.id)?._count._all ?? 0 }))}
          prices={gp.map(x => ({ groupId: x.groupId, productId: x.productId, price: x.price.toString() })).filter((x, i, arr) => arr.findIndex(y => y.groupId === x.groupId && y.productId === x.productId) === i)} />
      </div>
    </>
  );
}
