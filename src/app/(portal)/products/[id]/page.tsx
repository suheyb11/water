import { notFound } from "next/navigation";
import { requirePage } from "@/server/auth/session";
import { getProduct } from "@/server/services/products";
import { defaultPriceAt } from "@/server/services/pricing";
import { getSettings } from "@/server/services/settings";
import { prisma } from "@/server/db";
import { PageHeader, idOf } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { dbDate, formatDate, todayIso } from "@/lib/dates";
import { formatPrice } from "@/lib/money";
import { ProductForm } from "../product-form";

export const metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage("products.view");
  const p = await getProduct((idOf((await params).id) ?? -1));
  if (!p) notFound();
  const s = await getSettings();
  const today = todayIso();
  const cur = await defaultPriceAt(prisma, p.id, dbDate(today));
  return (
    <>
      <PageHeader title={p.name} description={`${p.code} · ${Number(p.capacity)} ${p.capacityUnit} per ${p.saleUnit}`} />
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        {actor.permissions.has("products.manage")
          ? <ProductForm id={p.id} today={today} symbol={s.currencySymbol} initial={{ code: p.code, name: p.name, description: p.description ?? "", capacity: p.capacity.toString(), capacityUnit: p.capacityUnit, saleUnit: p.saleUnit, defaultPrice: cur.price.toString(), costPrice: p.costPrice.toString(), status: p.status as "ACTIVE" | "INACTIVE", trackStock: p.trackStock, reorderLevel: p.reorderLevel.toString(), sortOrder: String(p.sortOrder) }} />
          : <Card className="p-5 text-sm">Default price {formatPrice(cur.price.toString(), s.currencySymbol)}</Card>}
        <Card className="h-fit"><CardHeader><CardTitle>Default price history</CardTitle></CardHeader><CardContent className="px-0 pb-2">
          <Table><THead><TR><TH>From</TH><TH>Until</TH><TH className="text-right">Price</TH></TR></THead>
            <TBody>{p.listPrices.map(lp => <TR key={lp.id}><TD>{formatDate(lp.effectiveFrom)}</TD><TD>{lp.effectiveTo ? formatDate(lp.effectiveTo) : "open"}</TD><TD className="text-right tabular">{formatPrice(lp.price.toString(), s.currencySymbol)}<p className="text-xs text-muted-foreground">{lp.reason}</p></TD></TR>)}</TBody></Table>
        </CardContent></Card>
      </div>
    </>
  );
}
