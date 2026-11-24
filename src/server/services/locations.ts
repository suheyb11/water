import { z } from "zod";
import { prisma, inTx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { LOCATION_KINDS } from "@/lib/constants";

const coord = (lo: number, hi: number) => z.union([z.string(), z.number()]).optional().nullable()
  .transform(v => (v === "" || v === null || v === undefined ? null : Number(v)))
  .refine(v => v === null || (Number.isFinite(v) && v >= lo && v <= hi), `Must be between ${lo} and ${hi}`);

export const locationInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  kind: z.enum(LOCATION_KINDS),
  name: z.string().trim().min(2, "Name is required").max(120),
  alsoKnownAs: z.string().trim().max(300).optional().nullable().transform(v => v || null),
  description: z.string().trim().max(600).optional().nullable().transform(v => v || null),
  parentId: z.union([z.coerce.number().int().positive(), z.literal(""), z.null()]).optional().transform(v => (v ? Number(v) : null)),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  isActive: z.union([z.boolean(), z.string()]).optional().transform(v => v === undefined ? true : v === true || v === "true" || v === "on"),
});

const PARENT_KIND: Record<string, string | null> = { DISTRICT: null, NEIGHBORHOOD: "DISTRICT", PLACE: "NEIGHBORHOOD" };

export async function saveLocation(actor: Actor, raw: z.input<typeof locationInput>) {
  assertCan(actor, "locations.manage");
  const { id, latitude, longitude, ...data } = locationInput.parse(raw);
  return inTx(async tx => {
    if (data.parentId) {
      const parent = await tx.location.findUnique({ where: { id: data.parentId } });
      if (!parent) notFound("Parent location");
      if (PARENT_KIND[data.kind] && parent!.kind !== PARENT_KIND[data.kind]) fail(`A ${data.kind.toLowerCase()} belongs under a ${PARENT_KIND[data.kind]!.toLowerCase()}`, "VALIDATION", "parentId");
    } else if (data.kind === "NEIGHBORHOOD") {
      // neighbourhoods may exist without a district (local names often have none); places too
    }
    const dup = await tx.location.findFirst({ where: { kind: data.kind, parentId: data.parentId, name: data.name, ...(id ? { NOT: { id } } : {}) } });
    if (dup) fail(`"${data.name}" already exists here`, "VALIDATION", "name");
    const values = { ...data, latitude: latitude === null ? null : String(latitude), longitude: longitude === null ? null : String(longitude) };
    const row = id ? await tx.location.update({ where: { id }, data: values }) : await tx.location.create({ data: values });
    await audit(tx, actor, id ? "location.update" : "location.create", "Location", row.id, `${row.kind} ${row.name}`, null, row);
    return row;
  });
}

export async function listLocations(opts: { kind?: string; q?: string; parentId?: number; activeOnly?: boolean } = {}) {
  return prisma.location.findMany({
    where: {
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.parentId ? { parentId: opts.parentId } : {}),
      ...(opts.activeOnly ? { isActive: true } : {}),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" as const } }, { alsoKnownAs: { contains: opts.q, mode: "insensitive" as const } }, { description: { contains: opts.q, mode: "insensitive" as const } }] } : {}),
    },
    include: {
      parent: { select: { id: true, name: true, kind: true, parent: { select: { id: true, name: true } } } },
      _count: { select: { addressesAsDistrict: true, addressesAsNeighborhood: true, addressesAsPlace: true, children: true } },
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: 500,
  });
}

/** Compact tree used by address pickers. */
export async function locationOptions() {
  const rows = await prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, kind: true, name: true, parentId: true, alsoKnownAs: true } });
  return rows;
}
