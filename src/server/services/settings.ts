import { z } from "zod";
import { prisma, inTx, type Db } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail } from "../errors";
import { PAYMENT_METHOD_KINDS } from "@/lib/constants";

export async function getSettings(db: Db = prisma) {
  const s = await db.businessSettings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return db.businessSettings.create({ data: { id: 1, companyName: "Water Company" } });
}

const opt = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const bool = z.union([z.boolean(), z.string()]).transform(v => v === true || v === "true" || v === "on" || v === "1");

export const settingsInput = z.object({
  companyName: z.string().trim().min(2).max(160),
  tagline: opt(200),
  address: opt(400),
  phone: opt(80),
  email: opt(160),
  taxNumber: opt(80),
  logoDataUrl: z.string().max(1_500_000).optional().nullable()
    .refine(v => !v || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v), "Logo must be a PNG, JPEG, WEBP or SVG image")
    .transform(v => (v ? v : null)),
  currencyCode: z.string().trim().length(3).transform(s => s.toUpperCase()),
  currencySymbol: z.string().trim().min(1).max(8),
  timezone: z.string().trim().min(3).max(60).refine(tz => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Z0-9]+$/i, "Letters and digits only"),
  receiptPrefix: z.string().trim().min(1).max(12).regex(/^[A-Z0-9]+$/i, "Letters and digits only"),
  creditNotePrefix: z.string().trim().min(1).max(12).regex(/^[A-Z0-9]+$/i, "Letters and digits only"),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  allowNegativeStock: bool,
  lowStockThreshold: z.coerce.number().min(0),
  invoiceFooter: opt(600),
});

export async function updateSettings(actor: Actor, raw: unknown) {
  assertCan(actor, "settings.manage");
  const input = settingsInput.parse(raw);
  return inTx(async tx => {
    const before = await getSettings(tx);
    const after = await tx.businessSettings.update({
      where: { id: 1 },
      data: { ...input, lowStockThreshold: String(input.lowStockThreshold), updatedById: actor.userId },
    });
    const strip = (s: typeof before) => ({ ...s, logoDataUrl: s.logoDataUrl ? "(logo)" : null });
    await audit(tx, actor, "settings.update", "BusinessSettings", 1, "Business settings changed", strip(before), strip(after));
    return after;
  });
}

export const paymentMethodInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/i, "Letters, digits and _ only").transform(s => s.toUpperCase()),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(PAYMENT_METHOD_KINDS),
  isActive: bool.default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function savePaymentMethod(actor: Actor, raw: unknown) {
  assertCan(actor, "settings.manage");
  const { id, ...data } = paymentMethodInput.parse(raw);
  return inTx(async tx => {
    const dup = await tx.paymentMethod.findFirst({ where: { code: data.code, ...(id ? { NOT: { id } } : {}) } });
    if (dup) fail("A payment method with this code already exists", "VALIDATION", "code");
    const row = id ? await tx.paymentMethod.update({ where: { id }, data }) : await tx.paymentMethod.create({ data });
    await audit(tx, actor, id ? "payment_method.update" : "payment_method.create", "PaymentMethod", row.id, `${row.name} (${row.kind})`, null, row);
    return row;
  });
}

export const groupInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_-]+$/i, "Letters, digits, - and _ only").transform(s => s.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  description: opt(300),
  isActive: bool.default(true),
});

export async function saveCustomerGroup(actor: Actor, raw: unknown) {
  assertCan(actor, "pricing.manage");
  const { id, ...data } = groupInput.parse(raw);
  return inTx(async tx => {
    const dup = await tx.customerGroup.findFirst({ where: { code: data.code, ...(id ? { NOT: { id } } : {}) } });
    if (dup) fail("A group with this code already exists", "VALIDATION", "code");
    const row = id ? await tx.customerGroup.update({ where: { id }, data }) : await tx.customerGroup.create({ data });
    await audit(tx, actor, id ? "group.update" : "group.create", "CustomerGroup", row.id, row.name, null, row);
    return row;
  });
}

export const listPaymentMethods = (activeOnly = true) =>
  prisma.paymentMethod.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
export const listGroups = (activeOnly = true) =>
  prisma.customerGroup.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: { name: "asc" } });
