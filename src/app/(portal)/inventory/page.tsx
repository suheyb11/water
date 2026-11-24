import Link from "next/link";
import { AlertTriangle, Boxes } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { stockLevels } from "@/server/services/inventory";
import { PageHeader, Pager, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, CardContent, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PeriodPicker, SelectFilter } from "@/components/client-kit";
import { dbDate, formatDate, formatDateTime, presetRange, todayIso } from "@/lib/dates";
import { D, formatQty } from "@/lib/money";
import { STOCK_MOVE_TYPES, type StockMoveType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { StockForm } from "./stock-form";

export const metadata = { title: "Inventory" };
const PAGE = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("inventory.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const page = pageOf(sp.page);
  const where = { moveDate: { gte: dbDate(r.from), lte: dbDate(r.to) }, ...(sp.product ? { productId: (idOf(sp.product) ?? -1) } : {}), ...(sp.type ? { type: sp.type } : {}) };
  const [levels, moves, total, products, users] = await Promise.all([
    stockLevels(),
    prisma.stockMovement.findMany({ where, orderBy: [{ moveDate: "desc" }, { id: "desc" }], take: PAGE, skip: (page - 1) * PAGE, include: { product: { select: { name: true } } } }),
    prisma.stockMovement.count({ where }),
    prisma.product.findMany({ where: { trackStock: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, fullName: true } }),
  ]);
  return (
    <>
      <PageHeader title="Inventory" description="Stock on hand is the sum of all movements. Every movement has a reference; sales reduce stock when posted."
        actions={actor.permissions.has("inventory.manage") && <StockForm products={products} today={todayIso()} canNegative={actor.permissions.has("inventory.negative")} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {levels.map(l => (
          <Card key={l.id} className={cn("p-4", l.low && "border-warning/60")}>
            <p className="text-[13px] text-muted-foreground">{l.name}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular", D(l.onHand).isNegative() && "text-destructive")}>{formatQty(l.onHand)} <span className="text-sm font-normal text-muted-foreground">{l.saleUnit}s</span></p>
            {l.low && <p className="mt-1 flex items-center gap-1 text-xs text-[color-mix(in_oklch,var(--warning)_60%,var(--foreground))]"><AlertTriangle className="size-3.5" />At or below reorder level ({formatQty(l.reorderLevel)})</p>}
          </Card>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodPicker preset={r.preset} from={r.from} to={r.to} />
        <SelectFilter name="product" placeholder="All products" options={products.map(p => ({ value: String(p.id), label: p.name }))} />
        <SelectFilter name="type" placeholder="All movements" options={Object.entries(STOCK_MOVE_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
      </div>
      <Card>
        {moves.length ? (
          <Table>
            <THead><TR><TH>Date</TH><TH>Product</TH><TH>Movement</TH><TH>Reference</TH><TH className="text-right">Quantity</TH><TH className="text-right">Balance after</TH><TH>Notes</TH><TH>By</TH></TR></THead>
            <TBody>{moves.map(m => (
              <TR key={m.id.toString()}>
                <TD className="whitespace-nowrap">{formatDate(m.moveDate)}<p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p></TD>
                <TD>{m.product.name}</TD><TD>{STOCK_MOVE_TYPES[m.type as StockMoveType]?.label ?? m.type}</TD>
                <TD>{m.invoiceId ? <Link className="text-primary hover:underline" href={`/invoices/${m.invoiceId}`}>{m.reference}</Link> : m.reference}</TD>
                <TD className={cn("text-right font-medium tabular", D(m.quantity).isNegative() ? "text-destructive" : "text-success")}>{D(m.quantity).greaterThan(0) ? "+" : ""}{formatQty(m.quantity.toString())}</TD>
                <TD className="text-right tabular">{formatQty(m.balanceAfter.toString())}</TD>
                <TD className="max-w-60 text-muted-foreground">{m.notes}</TD><TD className="text-muted-foreground">{users.find(u => u.id === m.createdById)?.fullName}</TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <CardContent><EmptyState icon={Boxes} title="No stock movements in this period" /></CardContent>}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/inventory" />
      </Card>
    </>
  );
}
