// Convert server data (Prisma Decimal, Date, BigInt) into plain JSON-safe values for client components.
// Decimals become exact strings, dates ISO strings, bigints strings.
type Plain<T> =
  T extends { toFixed(dp?: number): string; toNumber(): number } ? string :
  T extends Date ? string :
  T extends bigint ? string :
  T extends (infer U)[] ? Plain<U>[] :
  T extends object ? { [K in keyof T]: Plain<T[K]> } :
  T;

function isDecimal(v: unknown): boolean {
  return !!v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && typeof (v as { d?: unknown }).d !== "undefined";
}

export function plain<T>(v: T): Plain<T> {
  return toPlain(v) as Plain<T>;
}

function toPlain(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (isDecimal(v)) return String(v);
  if (Array.isArray(v)) return v.map(toPlain);
  if (v instanceof Set) return [...v].map(toPlain);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = toPlain(val);
    return out;
  }
  return v;
}
