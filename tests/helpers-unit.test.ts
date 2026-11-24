import { describe, expect, it } from "vitest";
import { idOf } from "@/components/common";
import { formatMoney, money } from "@/lib/money";
import { presetRange } from "@/lib/dates";

describe("small helpers", () => {
  it("idOf accepts positive integers only", () => {
    expect(idOf("229")).toBe(229);
    expect(idOf("0")).toBeNull();
    expect(idOf("abc")).toBeNull();
    expect(idOf("12abc")).toBeNull();
    expect(idOf(undefined)).toBeNull();
  });
  it("money is decimal-exact", () => {
    expect(money("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(formatMoney("1234.5", "$")).toBe("$1,234.50");
    expect(formatMoney("-5", "$")).toBe("-$5.00");
  });
  it("period presets", () => {
    expect(presetRange("month", undefined, undefined, "2026-11-21")).toEqual({ from: "2026-11-01", to: "2026-11-21", preset: "month" });
    expect(presetRange("custom", "2026-11-10", "2026-11-01", "2026-11-21")).toEqual({ from: "2026-11-01", to: "2026-11-10", preset: "custom" });
  });
});
