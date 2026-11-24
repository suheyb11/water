// Decimal-safe money arithmetic. Never use JS floating point for money.
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal.Value | { toString(): string };

export function D(v: Num | null | undefined): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(typeof v === "object" ? v.toString() : v);
}

/** Round to cents (money amounts). */
export const money = (v: Num) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Round unit prices (4 dp). */
export const price = (v: Num) => D(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
/** Round quantities (3 dp). */
export const qty = (v: Num) => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

export const sum = (vals: Num[]) => vals.reduce<Decimal>((a, v) => a.plus(D(v)), new Decimal(0));
export const min = (a: Num, b: Num) => Decimal.min(D(a), D(b));
export const isZero = (v: Num) => D(v).isZero();
export const isPos = (v: Num) => D(v).greaterThan(0);

/** String for Prisma Decimal columns (exact, no float conversion). */
export const toDb = (v: Num, dp = 2) => D(v).toFixed(dp);

export function formatMoney(v: Num | null | undefined, symbol = "$", opts: { sign?: boolean } = {}) {
  const d = money(D(v));
  const neg = d.isNegative();
  const abs = d.abs().toFixed(2);
  const [i, f] = abs.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const s = `${symbol}${grouped}.${f}`;
  if (neg) return `-${s}`;
  return opts.sign && d.greaterThan(0) ? `+${s}` : s;
}

export function formatQty(v: Num | null | undefined) {
  const d = qty(D(v));
  const s = d.toFixed(3).replace(/\.?0+$/, "");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatPrice(v: Num | null | undefined, symbol = "$") {
  const d = price(D(v));
  // show 2 decimals unless sub-cent precision is used
  const s = d.mul(100).isInteger() ? d.toFixed(2) : d.toFixed(4).replace(/0+$/, "");
  return `${symbol}${s}`;
}

export { Decimal };
