import { Receipt } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listExpenses, listExpenseCategories } from "@/server/services/expenses";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { Money, PageHeader, Pager, StatusBadge, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PeriodPicker, SearchInput, SelectFilter } from "@/components/client-kit";
import { formatDate, presetRange, todayIso } from "@/lib/dates";
import { Categories, NewExpense, VoidExpense } from "./expense-tools";

export const metadata = { title: "Expenses" };
const PAGE = 50;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("expenses.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "month", sp.from, sp.to);
  const page = pageOf(sp.page);
  const [e, cats, methods, s] = await Promise.all([
    listExpenses({ from: r.from, to: r.to, categoryId: sp.category ? (idOf(sp.category) ?? -1) : undefined, q: sp.q, includeVoid: sp.void === "1", take: PAGE, skip: (page - 1) * PAGE }),
    listExpenseCategories(), listPaymentMethods(), getSettings(),
  ]);
  const sym = s.currencySymbol;
  const manage = actor.permissions.has("expenses.manage");
  return (
    <>
      <PageHeader title="Expenses" description={<>Total in period: <b><Money value={e.sum.toString()} symbol={sym} /></b>. Expenses reduce cash and appear in the daily statement and profit &amp; loss.</>}
        actions={manage && <><Categories categories={cats.map(c => ({ id: c.id, name: c.name, isActive: c.isActive }))} /><NewExpense categories={cats.filter(c => c.isActive).map(c => ({ id: c.id, name: c.name }))} methods={methods.map(m => ({ id: m.id, name: m.name }))} today={todayIso()} symbol={sym} canBackdate={actor.permissions.has("sales.backdate")} /></>} />
      <div className="mb-4"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>
      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <Card>
          <div className="flex flex-wrap gap-2 border-b p-3"><SearchInput placeholder="Description, payee, reference" /><SelectFilter name="category" placeholder="All categories" options={cats.map(c => ({ value: String(c.id), label: c.name }))} /><SelectFilter name="void" placeholder="Hide voided" options={[{ value: "1", label: "Show voided" }]} /></div>
          {e.rows.length ? (
            <Table>
              <THead><TR><TH>No.</TH><TH>Date</TH><TH>Category</TH><TH>Description</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH>By</TH>{manage && <TH />}</TR></THead>
              <TBody>{e.rows.map(x => (
                <TR key={x.id} className={x.status === "VOID" ? "text-muted-foreground line-through" : ""}>
                  <TD className="font-medium">{x.number}</TD><TD className="whitespace-nowrap">{formatDate(x.expenseDate)}</TD><TD>{x.category.name}</TD>
                  <TD>{x.description}{x.payee && <p className="text-xs text-muted-foreground">to {x.payee}{x.reference ? ` · ${x.reference}` : ""}</p>}{x.status === "VOID" && <p className="text-xs">void: {x.voidReason}</p>}</TD>
                  <TD>{x.method.name}</TD><TD className="text-right"><Money value={x.amount.toString()} symbol={sym} /></TD><TD className="text-muted-foreground">{x.createdBy.fullName}</TD>
                  {manage && <TD>{x.status === "POSTED" ? <VoidExpense id={x.id} number={x.number} /> : <StatusBadge status="VOID" />}</TD>}
                </TR>
              ))}</TBody>
            </Table>
          ) : <EmptyState icon={Receipt} title="No expenses in this period" />}
          <Pager total={e.total} page={page} pageSize={PAGE} params={sp} basePath="/expenses" />
        </Card>
        <Card className="h-fit"><CardHeader><CardTitle>By category</CardTitle></CardHeader><CardContent className="grid gap-1.5 text-sm">
          {e.byCategory.length ? e.byCategory.sort((a, b) => b.amount.comparedTo(a.amount)).map(b => <div key={b.categoryId} className="flex justify-between"><span>{cats.find(c => c.id === b.categoryId)?.name}</span><Money value={b.amount.toString()} symbol={sym} /></div>) : <p className="text-muted-foreground">—</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
