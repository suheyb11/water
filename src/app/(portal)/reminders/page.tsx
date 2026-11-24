import Link from "next/link";
import { BellRing } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listReminders } from "@/server/services/reminders";
import { getSettings } from "@/server/services/settings";
import { EmptyState, PageHeader, Pager, pageOf } from "@/components/common";
import { Card } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ReminderTable } from "./reminder-list";

export const metadata = { title: "Payment reminders" };
const PAGE = 50;
const VIEWS = [{ k: "due", l: "Due now" }, { k: "upcoming", l: "Upcoming" }, { k: "closed", l: "Closed" }] as const;

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("reminders.view");
  const sp = await searchParams;
  const view = (VIEWS.find(v => v.k === sp.view)?.k ?? "due") as "due" | "upcoming" | "closed";
  const page = pageOf(sp.page);
  const [{ rows, total }, s, due, upcoming] = await Promise.all([
    listReminders({ view, take: PAGE, skip: (page - 1) * PAGE }), getSettings(),
    listReminders({ view: "due", take: 1 }), listReminders({ view: "upcoming", take: 1 }),
  ]);
  const counts = { due: due.total, upcoming: upcoming.total, closed: null as number | null };
  return (
    <>
      <PageHeader title="Payment reminders" description="Customers who asked to be called back about what they owe. Reminders pop up when due and close by themselves once the customer has paid. Add one from a sale, a customer or an invoice." />
      <div className="mb-4 flex gap-1 border-b">
        {VIEWS.map(v => (
          <Link key={v.k} href={`/reminders?view=${v.k}`} className={cn("border-b-2 px-3 py-2 text-sm font-medium", view === v.k ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {v.l}{counts[v.k] !== null && <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", v.k === "due" && counts.due ? "bg-destructive text-white" : "bg-muted")}>{counts[v.k]}</span>}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length
          ? <ReminderTable symbol={s.currencySymbol} canManage={actor.permissions.has("reminders.manage")} closed={view === "closed"}
              rows={rows.map(r => ({ ...r, whenText: formatDateTime(view === "closed" ? (r.lastCallAt ?? r.remindAt) : r.remindAt), lastCallText: r.lastCallAt ? formatDateTime(r.lastCallAt) : null }))} />
          : <EmptyState icon={BellRing} title={view === "due" ? "No calls due right now" : view === "upcoming" ? "No upcoming reminders" : "No closed reminders"} />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/reminders" />
      </Card>
    </>
  );
}
