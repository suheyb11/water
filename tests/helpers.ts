import { prisma } from "@/server/db";
import { seedBase } from "@/server/seed-base";
import type { Actor } from "@/server/actor";
import { ALL_PERMISSIONS, type PermissionCode } from "@/lib/constants";
import { createCustomer, type NewCustomerInput } from "@/server/services/customers";
import { recordStockMovement } from "@/server/services/inventory";
import { D } from "@/lib/money";

/** Empty every table (children first) and load the reference data again. */
export async function resetDb() {
  const order = [
    "reminderEvent", "paymentReminder", "deliveryEvent", "deliveryItem", "delivery", "allocation", "refund", "creditNoteItem", "creditNote", "payment",
    "invoiceItem", "invoice", "inventory", "customerProductPrice", "groupProductPrice", "productPrice", "priceChangeLog",
    "customerAddress", "customer", "customerGroup", "location", "expense", "expenseCategory", "product", "paymentMethod",
    "idempotencyKey", "documentSequence", "session", "userRole", "rolePermission", "role", "permission", "user", "businessSettings",
  ] as const;
  // append-only tables are protected by triggers against DELETE; the test database empties them with TRUNCATE
  // schema-qualified: the Prisma adapter's `schema` option does not change search_path for raw SQL
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  const tables = ["LedgerEntry", "StockMovement", "AuditLog"].map(t => `"${schema}"."${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables}`);
  for (const t of order) await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[t].deleteMany();
  await seedBase(prisma);
}

let n = 0;
export async function makeActor(perms: PermissionCode[] = ALL_PERMISSIONS): Promise<Actor> {
  const u = await prisma.user.create({ data: { username: `tester${++n}${Date.now()}`, fullName: `Tester ${n}`, passwordHash: "x" } });
  return { userId: u.id, username: u.username, fullName: u.fullName, roles: ["Test"], permissions: new Set(perms) };
}

export async function water20() {
  return prisma.product.findFirstOrThrow({ where: { code: "W20" } });
}

export async function cash() {
  return prisma.paymentMethod.findFirstOrThrow({ where: { code: "CASH" } });
}

export async function addStock(actor: Actor, productId: number, quantity = 1000) {
  await recordStockMovement(actor, { productId, type: "PRODUCTION", quantity, reference: "TEST-STOCK" });
}

export async function newCustomer(actor: Actor, over: Partial<NewCustomerInput> = {}) {
  n++;
  return createCustomer(actor, {
    name: `Customer ${n}`, phone: `+25261${String(1000000 + n * 7919).slice(-7)}`,
    address: { localName: `Near the old mosque ${n}` },
    ...over,
  });
}

export async function balanceOf(customerId: number) {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return D(c.balance).toFixed(2);
}
