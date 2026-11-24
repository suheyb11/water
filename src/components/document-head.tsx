import { BrandMark } from "@/components/brand";

/** Company block used on printable invoices, receipts and statements. */
export function DocumentHead({ s, title, number, children }: { s: { companyName: string; tagline: string | null; address: string | null; phone: string | null; email: string | null; taxNumber: string | null; logoDataUrl: string | null }; title: string; number?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6 border-b pb-5">
      <div className="flex items-start gap-3">
        {s.logoDataUrl ? <img src={s.logoDataUrl} alt="" className="h-14 w-auto max-w-40 object-contain" /> : <BrandMark className="size-12" />}
        <div className="text-sm">
          <p className="text-lg font-semibold">{s.companyName}</p>
          {s.tagline && <p className="text-muted-foreground">{s.tagline}</p>}
          {s.address && <p className="text-muted-foreground">{s.address}</p>}
          <p className="text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</p>
          {s.taxNumber && <p className="text-muted-foreground">Tax no. {s.taxNumber}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-semibold uppercase tracking-wide text-primary">{title}</p>
        {number && <p className="font-mono text-sm">{number}</p>}
        {children}
      </div>
    </div>
  );
}
