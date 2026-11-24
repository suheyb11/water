// Business dates. All business days are calendar days in the business timezone (default Africa/Mogadishu).
// A business date is passed around as "YYYY-MM-DD" and stored in DATE columns as UTC midnight.

export const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "Africa/Mogadishu";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in the business timezone. */
export function todayIso(tz = BUSINESS_TZ, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY-MM-DD" → Date at UTC midnight (what Prisma writes to a DATE column). */
export function dbDate(iso: string): Date {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date from a DATE column → "YYYY-MM-DD". */
export function isoOf(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = dbDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

export function startOfWeek(iso: string): string {
  // weeks start on Saturday (Somali business week); configurable later if needed
  const d = dbDate(iso);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const back = (dow + 1) % 7; // Sat → 0
  return addDays(iso, -back);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = dbDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return isoOf(d);
}

export type PeriodPreset = "today" | "yesterday" | "week" | "month" | "lastmonth" | "custom";

/** Inclusive date range for a preset. */
export function presetRange(preset: string | undefined, from?: string, to?: string, today = todayIso()): { from: string; to: string; preset: PeriodPreset } {
  switch (preset) {
    case "yesterday": { const y = addDays(today, -1); return { from: y, to: y, preset: "yesterday" }; }
    case "week": return { from: startOfWeek(today), to: today, preset: "week" };
    case "month": return { from: startOfMonth(today), to: today, preset: "month" };
    case "lastmonth": { const last = addDays(startOfMonth(today), -1); return { from: startOfMonth(last), to: last, preset: "lastmonth" }; }
    case "custom":
      if (isIsoDate(from) && isIsoDate(to)) return from <= to ? { from, to, preset: "custom" } : { from: to, to: from, preset: "custom" };
      return { from: today, to: today, preset: "today" };
    default:
      if (isIsoDate(from) && isIsoDate(to)) return { from, to, preset: "custom" };
      return { from: today, to: today, preset: "today" };
  }
}

export function formatDate(d: Date | string | null | undefined): string {
  const iso = isoOf(d);
  if (!iso) return "—";
  const [y, m, day] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

export function formatDateTime(d: Date | string | null | undefined, tz = BUSINESS_TZ): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

// ───────── wall-clock time in the business timezone ─────────

/** Minutes the timezone is ahead of UTC at a given instant. */
function tzOffsetMinutes(at: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(p.find(x => x.type === t)!.value);
  const wall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((wall - at.getTime()) / 60000);
}

export const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "YYYY-MM-DDTHH:mm" in the business timezone → UTC instant. */
export function localToUtc(local: string, tz = BUSINESS_TZ): Date {
  if (!LOCAL_DT.test(local)) throw new Error(`Invalid date/time: ${local}`);
  const asUtc = new Date(`${local}:00Z`);
  const guess = new Date(asUtc.getTime() - tzOffsetMinutes(asUtc, tz) * 60000);
  return new Date(asUtc.getTime() - tzOffsetMinutes(guess, tz) * 60000);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in the business timezone (for datetime-local inputs). */
export function utcToLocal(at: Date | string, tz = BUSINESS_TZ): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000).toISOString().slice(0, 16);
}
