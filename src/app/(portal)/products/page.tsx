import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listProducts } from "@/server/services/products";
import { defaultPriceAt } from "@/server/services/pricing";
import { getSettings } from "@/server/services/settings";
import { prisma } from "@/server/db";
import { PageHeader, StatusBadge, EmptyState } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { dbDate, todayIso } from "@/lib/dates";
import { D, formatPrice, formatQty } from "@/lib/money";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const actor = await requirePage("products.view");
  const [rows, s] = await Promise.all([listProducts(), getSettings()]);
  const prices = await Promise.all(rows.map(p => defaultPriceAt(prisma, p.id, dbDate(todayIso()))));
  return (
    <>
      <PageHeader title="Products" description="Water sizes and variants. Nothing is hard-coded: capacity, unit and prices are configurable and changes only affect new sales."
        actions={actor.permissions.has("products.manage") && <Button asChild><Link href="/products/new"><Plus />Add product</Link></Button>} />
      <Card>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Code</TH><TH>Product</TH><TH>Capacity</TH><TH className="text-right">Default price</TH><TH className="text-right">Cost</TH><TH className="text-right">In stock</TH><TH className="text-right">Customer prices</TH><TH>Status</TH></TR></THead>
            <TBody>{rows.map((p, i) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{p.code}</TD>
                <TD><Link href={`/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link><p className="text-xs text-muted-foreground">per {p.saleUnit}</p></TD>
                <TD>{Number(p.capacity)} {p.capacityUnit}</TD>
                <TD className="text-right tabular">{formatPrice(prices[i].price.toString(), s.currencySymbol)}</TD>
                <TD className="text-right tabular text-muted-foreground">{formatPrice(p.costPrice.toString(), s.currencySymbol)}</TD>
                <TD className="text-right tabular">{p.trackStock ? <span className={D(p.stock?.onHand ?? 0).lessThanOrEqualTo(p.reorderLevel) ? "font-medium text-destructive" : ""}>{formatQty(p.stock?.onHand.toString() ?? "0")}</span> : "not tracked"}</TD>
                <TD className="text-right">{p._count.customerPrices}</TD>
                <TD><StatusBadge status={p.status} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={Package} title="No products" />}
      </Card>
    </>
  );
}
