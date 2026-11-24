import Link from "next/link";
import { MapPin } from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { listLocations } from "@/server/services/locations";
import { PageHeader, StatusBadge, EmptyState } from "@/components/common";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { SearchInput, SelectFilter } from "@/components/client-kit";
import { LocationEditor } from "./location-tools";

export const metadata = { title: "Locations" };
const KIND: Record<string, string> = { DISTRICT: "District", NEIGHBORHOOD: "Neighbourhood", PLACE: "Local place" };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage("locations.manage", "customers.view");
  const sp = await searchParams;
  const [rows, all] = await Promise.all([listLocations({ kind: sp.kind, q: sp.q }), listLocations({})]);
  const manage = actor.permissions.has("locations.manage");
  const opts = all.map(l => ({ id: l.id, kind: l.kind, name: l.name }));
  return (
    <>
      <PageHeader title="Locations" description="Districts, neighbourhoods and the local places people actually use (landmarks, junctions, markets). Customers are linked to them through their own address."
        actions={manage && <LocationEditor all={opts} trigger="new" />} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3"><SearchInput placeholder="Name or other name" /><SelectFilter name="kind" placeholder="All kinds" options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} /></div>
        {rows.length ? (
          <Table>
            <THead><TR><TH>Name</TH><TH>Kind</TH><TH>Inside</TH><TH>Also known as</TH><TH className="text-right">Customers</TH><TH>Status</TH>{manage && <TH />}</TR></THead>
            <TBody>{rows.map(l => {
              const n = l._count.addressesAsDistrict + l._count.addressesAsNeighborhood + l._count.addressesAsPlace;
              return (
                <TR key={l.id}>
                  <TD className="font-medium">{l.name}{l.description && <p className="text-xs font-normal text-muted-foreground">{l.description}</p>}</TD>
                  <TD>{KIND[l.kind]}</TD>
                  <TD>{l.parent ? `${l.parent.name}${l.parent.parent ? `, ${l.parent.parent.name}` : ""}` : "—"}</TD>
                  <TD className="text-muted-foreground">{l.alsoKnownAs ?? "—"}</TD>
                  <TD className="text-right">{n ? <Link className="text-primary hover:underline" href={`/customers?q=${encodeURIComponent(l.name)}`}>{n}</Link> : 0}</TD>
                  <TD><StatusBadge status={l.isActive ? "ACTIVE" : "INACTIVE"} /></TD>
                  {manage && <TD><LocationEditor all={opts} trigger="edit" initial={{ id: l.id, kind: l.kind as "DISTRICT", name: l.name, alsoKnownAs: l.alsoKnownAs ?? "", description: l.description ?? "", parentId: l.parentId ? String(l.parentId) : "", latitude: l.latitude?.toString() ?? "", longitude: l.longitude?.toString() ?? "", isActive: l.isActive }} /></TD>}
                </TR>
              );
            })}</TBody>
          </Table>
        ) : <EmptyState icon={MapPin} title="No locations yet">Add the districts and neighbourhoods you deliver to, then the local places customers mention.</EmptyState>}
      </Card>
    </>
  );
}
