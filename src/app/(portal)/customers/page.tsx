import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listCustomers } from "@/server/services/customers";
import { getSettings, listGroups } from "@/server/services/settings";
import { listLocations } from "@/server/services/locations";
import { Balance, PageHeader, Pager, StatusBadge, pageOf, EmptyState, idOf } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SearchInput, SelectFilter } from "@/components/client-kit";
import { addressLine } from "@/lib/address";
import { label } from "@/lib/constants";

export const metadata = { title: "Customers" };
const PAGE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("customers.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const [{ rows, total }, s, groups, hoods] = await Promise.all([
    listCustomers({ q: sp.q, status: sp.status, groupId: sp.group ? (idOf(sp.group) ?? -1) : undefined, neighborhoodId: sp.hood ? (idOf(sp.hood) ?? -1) : undefined, balance: sp.balance as "owing" | "credit" | "settled" | undefined, sort: sp.sort, take: PAGE, skip: (page - 1) * PAGE }),
    getSettings(), listGroups(), listLocations({ kind: "NEIGHBORHOOD", activeOnly: true }),
  ]);
  const finance = actor.permissions.has("ledger.view") || actor.permissions.has("invoices.view");
  return (
    <>
      <PageHeader title="Customers" description="Search by name, phone, customer number or the local name of the place."
        actions={actor.permissions.has("customers.manage") && <Button asChild><Link href="/customers/new"><Plus />Register customer</Link></Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput placeholder="Name, phone, CUS-…, local address" />
          <SelectFilter name="hood" placeholder="All neighbourhoods" options={hoods.map(h => ({ value: String(h.id), label: h.name }))} />
          {groups.length > 0 && <SelectFilter name="group" placeholder="All groups" options={groups.map(g => ({ value: String(g.id), label: g.name }))} />}
          {finance && <SelectFilter name="balance" placeholder="Any balance" options={[{ value: "owing", label: "Owes money" }, { value: "credit", label: "Has credit" }, { value: "settled", label: "Settled" }]} />}
          <SelectFilter name="status" placeholder="Active + inactive" options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]} />
          <SelectFilter name="sort" placeholder="Sort: name" options={[{ value: "recent", label: "Newest first" }, ...(finance ? [{ value: "balance", label: "Highest balance" }] : [])]} />
        </div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Customer</TH><TH>Phone</TH><TH>Local address</TH><TH>Type</TH>{finance && <TH className="text-right">Balance</TH>}<TH>Status</TH></TR></THead>
            <TBody>
              {rows.map(c => (
                <TR key={c.id}>
                  <TD><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-muted-foreground">{c.code}{c.group ? ` · ${c.group.name}` : ""}</p></TD>
                  <TD className="tabular">{c.phone}{c.altPhone && <p className="text-xs text-muted-foreground">{c.altPhone}</p>}</TD>
                  <TD className="max-w-80"><span className="line-clamp-2">{addressLine(c.addresses[0]) || "—"}</span></TD>
                  <TD>{label(c.customerType)}</TD>
                  {finance && <TD className="text-right"><Balance value={c.balance.toString()} symbol={s.currencySymbol} /></TD>}
                  <TD><StatusBadge status={c.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={Users} title={sp.q ? `No customer matches “${sp.q}”` : "No customers yet"}>{actor.permissions.has("customers.manage") && "Register the first customer with their local address and prices."}</EmptyState>}
        <Pager total={total} page={page} pageSize={PAGE} params={sp} basePath="/customers" />
      </Card>
    </>
  );
}
