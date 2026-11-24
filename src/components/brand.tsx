import { cn } from "@/lib/utils";

/** Water-drop mark (original artwork). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid place-items-center rounded-xl bg-brand-deep text-white", className)}>
      <svg viewBox="0 0 24 24" className="size-[58%]" aria-hidden="true">
        <path d="M12 2.5c-.3 0-.6.2-.8.4C9.6 5 5.5 10.2 5.5 14a6.5 6.5 0 0 0 13 0c0-3.8-4.1-9-5.7-11.1a1 1 0 0 0-.8-.4Z" fill="currentColor" opacity=".95" />
        <path d="M9 14.5a3 3 0 0 0 3 3" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
