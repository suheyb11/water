import { BrandMark } from "@/components/brand";

export function AuthFrame({ title, subtitle, company, children }: { title: string; subtitle?: string; company: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-deep p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3"><BrandMark className="size-10 bg-white/10" /><div><p className="font-semibold">{company}</p><p className="text-sm text-white/70">Water Portal</p></div></div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Every container, every customer, every shilling — on one ledger.</h2>
          <p className="mt-3 text-white/75">Sales, customer prices, deliveries, payments and daily statements for the water business.</p>
        </div>
        <p className="relative text-xs text-white/50">Access is restricted to authorised staff. Activity is recorded.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><BrandMark className="size-10" /><p className="font-semibold">{company}</p></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
