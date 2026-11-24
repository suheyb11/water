import { z } from "zod";
import { prisma, inTx, type Tx } from "../db";
import type { Actor } from "../actor";
import { assertCan, can } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { nextNumber } from "../numbering";
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from "@/lib/constants";
import { dbDate, isIsoDate, todayIso } from "@/lib/dates";
import { D, money } from "@/lib/money";
import { setCustomerPriceTx } from "./pricing";
import { postOpeningBalanceTx } from "./adjustments";

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const phone = z.string().trim().min(5, "Phone number is required").max(40).regex(/^[+0-9 ()-]+$/, "Digits, spaces, + ( ) - only");
const coord = (lo: number, hi: number) => z.union([z.string(), z.number()]).optional().nullable()
  .transform(v => (v === "" || v === null || v === undefined ? null : Number(v)))
  .refine(v => v === null || (Number.isFinite(v) && v >= lo && v <= hi), `Must be between ${lo} and ${hi}`);
const optId = z.union([z.coerce.number().int().positive(), z.literal(""), z.null()]).optional().transform(v => (v ? Number(v) : null));

export const addressInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  label: z.string().trim().max(60).optional().transform(v => v || "Main"),
  isPrimary: z.boolean().optional().default(true),
  localName: z.string().trim().min(2, "Local address name is required (what people call the place)").max(200),
  officialAddress: text(300),
  districtId: optId,
  neighborhoodId: optId,
  placeId: optId,
  description: text(600),
  deliveryInstructions: text(600),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
});

export const customerInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(160),
  phone,
  altPhone: z.union([phone, z.literal(""), z.null()]).optional().transform(v => (v ? v : null)),
  customerType: z.enum(CUSTOMER_TYPES).default("RESIDENTIAL"),
  groupId: optId,
  status: z.enum(CUSTOMER_STATUSES).default("ACTIVE"),
  registeredOn: z.string().refine(isIsoDate, "Invalid date").optional(),
  creditLimit: z.union([z.string(), z.number(), z.null()]).optional().transform(v => (v === "" || v === null || v === undefined ? null : money(String(v))))
    .refine(v => v === null || !v.isNegative(), "Credit limit cannot be negative"),
  notes: text(1000),
});

export const newCustomerInput = customerInput.extend({
  address: addressInput,
  /** positive = customer owes us; negative = customer has credit with us */
  openingBalance: z.union([z.string(), z.number()]).optional().transform(v => (v === "" || v === undefined ? D(0) : money(String(v)))),
  prices: z.array(z.object({ productId: z.coerce.number().int().positive(), price: z.union([z.string(), z.number()]).transform(String) })).optional().default([]),
});
export type NewCustomerInput = z.input<typeof newCustomerInput>;

function addressData(a: z.output<typeof addressInput>) {
  const { latitude, longitude, ...rest } = a;
  delete (rest as { id?: number }).id;
  return { ...rest, latitude: latitude === null ? null : String(latitude), longitude: longitude === null ? null : String(longitude) };
}

async function checkPhoneUnique(tx: Tx, phoneNo: string, exceptId?: number) {
  const dup = await tx.customer.findFirst({ where: { OR: [{ phone: phoneNo }, { altPhone: phoneNo }], ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { code: true, name: true } });
  return dup;
}

/**
 * Register a customer in one step: details, local address, special prices and opening balance — all or nothing.
 */
export async function createCustomer(actor: Actor, raw: NewCustomerInput, opts: { allowDuplicatePhone?: boolean } = {}) {
  assertCan(actor, "customers.manage");
  const input = newCustomerInput.parse(raw);
  if (input.prices.length) assertCan(actor, "pricing.manage");
  if (!input.openingBalance.isZero()) assertCan(actor, "ledger.adjust");
  return inTx(async tx => {
    if (!opts.allowDuplicatePhone) {
      const dup = await checkPhoneUnique(tx, input.phone);
      if (dup) fail(`Phone ${input.phone} is already used by ${dup.name} (${dup.code})`, "DUPLICATE_PHONE", "phone");
    }
    const code = await nextNumber(tx, "CUS", "CUS", null);
    const registeredOn = input.registeredOn ?? todayIso();
    const customer = await tx.customer.create({
      data: {
        code, name: input.name, phone: input.phone, altPhone: input.altPhone, customerType: input.customerType, groupId: input.groupId,
        status: input.status, registeredOn: dbDate(registeredOn), creditLimit: input.creditLimit?.toFixed(2) ?? null, notes: input.notes,
        createdById: actor.userId,
        addresses: { create: { ...addressData(input.address), isPrimary: true } },
      },
      include: { addresses: true },
    });
    for (const p of input.prices) {
      if (p.price === "" ) continue;
      await setCustomerPriceTx(tx, actor, { customerId: customer.id, productId: p.productId, price: p.price, effectiveFrom: registeredOn, reason: "Set at registration" });
    }
    if (!input.openingBalance.isZero()) {
      await postOpeningBalanceTx(tx, actor, customer.id, input.openingBalance, registeredOn);
    }
    await audit(tx, actor, "customer.create", "Customer", customer.id, `${customer.code} ${customer.name}`, null, { ...customer, prices: input.prices, openingBalance: input.openingBalance.toFixed(2) });
    return customer;
  });
}

export async function updateCustomer(actor: Actor, id: number, raw: z.input<typeof customerInput>, opts: { allowDuplicatePhone?: boolean } = {}) {
  assertCan(actor, "customers.manage");
  const input = customerInput.parse(raw);
  return inTx(async tx => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) return notFound("Customer");
    if (!opts.allowDuplicatePhone && input.phone !== before.phone) {
      const dup = await checkPhoneUnique(tx, input.phone, id);
      if (dup) fail(`Phone ${input.phone} is already used by ${dup.name} (${dup.code})`, "DUPLICATE_PHONE", "phone");
    }
    const after = await tx.customer.update({
      where: { id },
      data: {
        name: input.name, phone: input.phone, altPhone: input.altPhone, customerType: input.customerType, groupId: input.groupId,
        status: input.status, creditLimit: input.creditLimit?.toFixed(2) ?? null, notes: input.notes,
        ...(input.registeredOn ? { registeredOn: dbDate(input.registeredOn) } : {}),
      },
    });
    await audit(tx, actor, "customer.update", "Customer", id, `${after.code} ${after.name}`, before, after);
    return after;
  });
}

export async function saveAddress(actor: Actor, customerId: number, raw: z.input<typeof addressInput>) {
  assertCan(actor, "customers.manage");
  const input = addressInput.parse(raw);
  return inTx(async tx => {
    const c = await tx.customer.findUnique({ where: { id: customerId } });
    if (!c) return notFound("Customer");
    if (input.isPrimary) await tx.customerAddress.updateMany({ where: { customerId, ...(input.id ? { NOT: { id: input.id } } : {}) }, data: { isPrimary: false } });
    let row;
    if (input.id) {
      const before = await tx.customerAddress.findFirst({ where: { id: input.id, customerId } });
      if (!before) return notFound("Address");
      row = await tx.customerAddress.update({ where: { id: input.id }, data: addressData(input) });
      await audit(tx, actor, "address.update", "Customer", customerId, `Address "${row.localName}" changed`, before, row);
    } else {
      row = await tx.customerAddress.create({ data: { ...addressData(input), customerId } });
      await audit(tx, actor, "address.create", "Customer", customerId, `Address "${row.localName}" added`, null, row);
    }
    const primaries = await tx.customerAddress.count({ where: { customerId, isPrimary: true, isActive: true } });
    if (!primaries) await tx.customerAddress.update({ where: { id: row.id }, data: { isPrimary: true } });
    return row;
  });
}

export async function deactivateAddress(actor: Actor, customerId: number, addressId: number) {
  assertCan(actor, "customers.manage");
  return inTx(async tx => {
    const a = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!a) return notFound("Address");
    const active = await tx.customerAddress.count({ where: { customerId, isActive: true } });
    if (active <= 1) fail("A customer needs at least one address");
    await tx.customerAddress.update({ where: { id: addressId }, data: { isActive: false, isPrimary: false } });
    if (a.isPrimary) {
      const next = await tx.customerAddress.findFirst({ where: { customerId, isActive: true }, orderBy: { id: "asc" } });
      if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await audit(tx, actor, "address.deactivate", "Customer", customerId, `Address "${a.localName}" removed`, a, null);
  });
}

const addrInclude = {
  district: { select: { id: true, name: true } },
  neighborhood: { select: { id: true, name: true } },
  place: { select: { id: true, name: true } },
} as const;

export function customerSearchWhere(q?: string) {
  if (!q) return {};
  const t = q.trim();
  return {
    OR: [
      { name: { contains: t } },
      { phone: { contains: t } },
      { altPhone: { contains: t } },
      { code: { contains: t } },
      { addresses: { some: { isActive: true, OR: [
        { localName: { contains: t } },
        { officialAddress: { contains: t } },
        { description: { contains: t } },
        { neighborhood: { name: { contains: t } } },
        { district: { name: { contains: t } } },
        { place: { OR: [{ name: { contains: t } }, { alsoKnownAs: { contains: t } }] } },
      ] } } },
    ],
  };
}

export async function listCustomers(opts: { q?: string; status?: string; groupId?: number; neighborhoodId?: number; balance?: "owing" | "credit" | "settled"; take?: number; skip?: number; sort?: string }) {
  const where = {
    ...customerSearchWhere(opts.q),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(opts.neighborhoodId ? { addresses: { some: { neighborhoodId: opts.neighborhoodId, isActive: true } } } : {}),
    ...(opts.balance === "owing" ? { balance: { gt: 0 } } : opts.balance === "credit" ? { balance: { lt: 0 } } : opts.balance === "settled" ? { balance: 0 } : {}),
  };
  const orderBy = opts.sort === "balance" ? [{ balance: "desc" as const }] : opts.sort === "recent" ? [{ id: "desc" as const }] : [{ name: "asc" as const }];
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where, orderBy, take: opts.take ?? 25, skip: opts.skip ?? 0,
      include: { group: { select: { name: true } }, addresses: { where: { isPrimary: true, isActive: true }, take: 1, include: addrInclude } },
    }),
    prisma.customer.count({ where }),
  ]);
  return { rows, total };
}

/** Fast lookup for the sales screen. */
export async function quickFindCustomers(q: string, take = 10) {
  return prisma.customer.findMany({
    where: { status: "ACTIVE", ...customerSearchWhere(q) },
    orderBy: { name: "asc" },
    take,
    select: { id: true, code: true, name: true, phone: true, balance: true, addresses: { where: { isPrimary: true, isActive: true }, take: 1, include: addrInclude } },
  });
}

export async function getCustomer(id: number) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      group: true,
      addresses: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }], include: addrInclude },
    },
  });
  return c;
}

export function canSeeFinance(actor: Actor) {
  return can(actor, "ledger.view") || can(actor, "invoices.view");
}
