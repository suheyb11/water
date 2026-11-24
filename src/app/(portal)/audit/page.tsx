import { ShieldCheck } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader, Pager, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PeriodPicker, SearchInput, SelectFilter } from "@/components/client-kit";
import { dbDate, addDays, formatDateTime, presetRange } from "@/lib/dates";

export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("audit.view");
  const sp = await searchParams;
  const r = presetRange(sp.period ?? "week", sp.from, sp.to);
  const page = pageOf(sp.page);
  // audit time is a UTC timestamp: business days start at 00:00 Mogadishu time = 21:00 UTC the day before
  const where = {
    at: { gte: new Date(dbDate(r.from).getTime() - 3 * 3600_000), lt: new Date(dbDate(addDays(r.to, 1)).getTime() - 3 * 3600_000) },
    ...(sp.user ? { userId: (idOf(sp.user) ?? -1) } : {}),
    ...(sp.entity ? { entity: sp.entity } : {}),
    ...(sp.q ? { OR: [{ action: { contains: sp.q } }, { summary: { contains: sp.q } }, { entityId: sp.q }] } : {}),
  };
  const [rows, total, users, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { user: { select: { fullName: true, username: true } } } }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.auditLog.groupBy({ by: ["entity"] }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" description="Who did what and when — sign-ins, every posting, price change, cancellation, reversal and setting change. Entries cannot be edited." />
      <div className="mb-3"><PeriodPicker preset={r.preset} from={r.from} to={r.to} /></div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3"><SearchInput placeholder="Action, text or record id" /><SelectFilter name="user" placeholder="All users" options={users.map(u => ({ value: String(u.id), label: u.fullName }))} /><SelectFilter name="entity" placeholder="All records" options={entities.map(e => ({ value: e.entity, label: e.entity }))} /></div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Record</TH><TH>Summary</TH><TH>IP</TH></TR></THead>
            <TBody>{rows.map(a => (
              <TR key={a.id.toString()}>
                <TD className="whitespace-nowrap">{formatDateTime(a.at)}</TD>
                <TD>{a.user?.fullName ?? "system"}</TD>
                <TD className="font-mono text-xs">{a.action}</TD>
                <TD className="whitespace-nowrap">{a.entity}{a.entityId ? ` #${a.entityId}` : ""}</TD>
                <TD className="max-w-xl"><span className="line-clamp-2">{a.summary}</span>
                  {(a.before || a.after) && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">changes</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">{a.before ? `before: ${a.before}\n` : ""}{a.after ? `after: ${a.after}` : ""}</pre></details>}</TD>
                <TD className="text-xs text-muted-foreground">{a.ip}</TD>
              </TR>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={ShieldCheck} title="No audit entries in this period" />}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/audit" />
      </Card>
    </>
  );
}
