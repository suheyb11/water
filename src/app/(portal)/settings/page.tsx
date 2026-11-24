import { requirePage } from "@/server/auth/session";
import { getSettings, listPaymentMethods } from "@/server/services/settings";
import { PageHeader } from "@/components/common";
import { PaymentMethods, SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePage("settings.manage");
  const [s, methods] = await Promise.all([getSettings(), listPaymentMethods(false)]);
  return (
    <>
      <PageHeader title="Settings" description="Business details, currency, timezone, numbering and payment methods." />
      <div className="grid gap-6">
        <SettingsForm initial={{
          companyName: s.companyName, tagline: s.tagline ?? "", address: s.address ?? "", phone: s.phone ?? "", email: s.email ?? "", taxNumber: s.taxNumber ?? "", logoDataUrl: s.logoDataUrl ?? "",
          currencyCode: s.currencyCode, currencySymbol: s.currencySymbol, timezone: s.timezone, invoicePrefix: s.invoicePrefix, receiptPrefix: s.receiptPrefix, creditNotePrefix: s.creditNotePrefix,
          paymentTermsDays: String(s.paymentTermsDays), allowNegativeStock: s.allowNegativeStock, lowStockThreshold: s.lowStockThreshold.toString(), invoiceFooter: s.invoiceFooter ?? "",
        }} />
        <PaymentMethods rows={methods.map(m => ({ id: m.id, code: m.code, name: m.name, kind: m.kind, isActive: m.isActive, sortOrder: m.sortOrder }))} />
      </div>
    </>
  );
}
