import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listDeliveryStaff } from "@/server/services/users";
import { PageHeader } from "@/components/common";
import { todayIso } from "@/lib/dates";
import { NewDeliveryForm } from "../delivery-tools";

export const metadata = { title: "New delivery" };

export default async function NewDeliveryPage() {
  await requirePage("deliveries.manage");
  const [products, drivers] = await Promise.all([prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }), listDeliveryStaff()]);
  return <><PageHeader title="New delivery order" description="For orders taken by phone. No sale, no stock movement until it is delivered." /><NewDeliveryForm products={products} drivers={drivers} today={todayIso()} /></>;
}
