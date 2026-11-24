// Reference data every installation needs. Idempotent: safe to run again (adds what is missing, never
// overwrites what the business has changed).
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_ROLES, PERMISSIONS, type PermissionCode } from "@/lib/constants";
import { todayIso, dbDate } from "@/lib/dates";
import { ensureSequences } from "./numbering";

export async function seedBase(prisma: PrismaClient) {
  const existing = new Set((await prisma.permission.findMany({ select: { code: true } })).map(p => p.code));
  const firstRun = existing.size === 0;
  const added: string[] = [];
  for (const [code, [module, description]] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, create: { code, module, description }, update: { module, description } });
    if (!existing.has(code)) added.push(code);
  }
  const perms = await prisma.permission.findMany();
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({ where: { code: r.code }, create: { code: r.code, name: r.name, description: r.description, isSystem: true }, update: {} });
    const has = await prisma.rolePermission.count({ where: { roleId: role.id } });
    // a new role gets its defaults; Super Admin always gets every permission (including ones added by upgrades)
    // permissions added by an upgrade go to the default roles that include them (an admin can remove them later)
    const want = r.code === "SUPER_ADMIN" || has === 0 ? r.permissions : firstRun ? [] : r.permissions.filter(p => added.includes(p));
    for (const p of perms.filter(p => want.includes(p.code as PermissionCode))) {
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
    }
  }

  await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, companyName: "Biyo Nadiif Water Company", tagline: "Purified drinking water", currencyCode: "USD", currencySymbol: "$", timezone: "Africa/Mogadishu" }, update: {} });

  const methods = [
    { code: "CASH", name: "Cash", kind: "CASH", sortOrder: 1 },
    { code: "EVC", name: "EVC Plus", kind: "MOBILE", sortOrder: 2 },
    { code: "EDAHAB", name: "eDahab", kind: "MOBILE", sortOrder: 3 },
    { code: "ZAAD", name: "Zaad", kind: "MOBILE", sortOrder: 4 },
    { code: "BANK", name: "Bank transfer", kind: "BANK", sortOrder: 5 },
  ];
  for (const m of methods) await prisma.paymentMethod.upsert({ where: { code: m.code }, create: m, update: {} });

  for (const name of ["Transportation", "Fuel", "Salaries", "Maintenance", "Electricity", "Water production", "Containers & caps", "Rent", "Other"]) {
    await prisma.expenseCategory.upsert({ where: { name }, create: { name }, update: {} });
  }

  await ensureSequences(prisma);

  if (!(await prisma.product.findFirst())) {
    const p = await prisma.product.create({
      data: {
        code: "W20", name: "Purified Drinking Water", description: "Purified drinking water in a returnable container", capacity: "20", capacityUnit: "L",
        saleUnit: "container", defaultPrice: "1.0000", costPrice: "0", reorderLevel: "50", sortOrder: 1,
        listPrices: { create: { price: "1.0000", effectiveFrom: dbDate(todayIso()), reason: "Initial price" } },
        stock: { create: { onHand: "0" } },
      },
    });
    await prisma.priceChangeLog.create({ data: { level: "DEFAULT", productId: p.id, newPrice: "1.0000", effectiveFrom: dbDate(todayIso()), action: "SET", reason: "Initial price" } });
  }
}
