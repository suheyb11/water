import { requirePage } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/common";
import { todayIso } from "@/lib/dates";
import { ProductForm } from "../product-form";

export const metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requirePage("products.manage");
  const s = await getSettings();
  return <><PageHeader title="Add product" /><ProductForm today={todayIso()} symbol={s.currencySymbol} /></>;
}
