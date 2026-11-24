import { prisma } from "../db";
import { dbDate, todayIso } from "@/lib/dates";

export async function listInvoices(opts: { q?: string; customerId?: number; status?: string; kind?: string; from?: string; to?: string; take?: number; skip?: number }) {
  const today = dbDate(todayIso());
  const statusWhere =
    opts.status === "OVERDUE" ? { status: { in: ["UNPAID", "PARTIALLY_PAID"] }, dueDate: { lt: today } }
    : opts.status === "OPEN" ? { status: { in: ["UNPAID", "PARTIALLY_PAID"] } }
    : opts.status ? { status: opts.status } : {};
  const where = {
    ...statusWhere,
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.from && opts.to ? { invoiceDate: { gte: dbDate(opts.from), lte: dbDate(opts.to) } } : {}),
    ...(opts.q ? { OR: [{ number: { contains: opts.q, mode: "insensitive" as const } }, { customerName: { contains: opts.q, mode: "insensitive" as const } }, { customerPhone: { contains: opts.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, agg] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }], take: opts.take ?? 25, skip: opts.skip ?? 0 }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { AND: [where, { status: { not: "CANCELLED" } }] }, _sum: { total: true, amountSettled: true } }),
  ]);
  return { rows, total, sumTotal: agg._sum.total, sumSettled: agg._sum.amountSettled };
}

export async function getInvoice(id: number) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { lineNo: "asc" }, include: { product: { select: { id: true } } } },
      customer: { select: { id: true, code: true, name: true, phone: true, balance: true } },
      createdBy: { select: { fullName: true } },
      allocations: { orderBy: { id: "asc" }, include: { payment: { include: { method: true } }, creditNote: true } },
      creditNotes: { orderBy: { id: "asc" } },
      relatedInvoice: { select: { id: true, number: true } },
      relatedDocs: { select: { id: true, number: true, kind: true, total: true } },
      delivery: { select: { id: true, number: true, status: true } },
      refund: { include: { method: true } },
    },
  });
}

export async function listPayments(opts: { q?: string; customerId?: number; from?: string; to?: string; methodId?: number; take?: number; skip?: number }) {
  const where = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.methodId ? { methodId: opts.methodId } : {}),
    ...(opts.from && opts.to ? { paymentDate: { gte: dbDate(opts.from), lte: dbDate(opts.to) } } : {}),
    ...(opts.q ? { OR: [{ number: { contains: opts.q, mode: "insensitive" as const } }, { reference: { contains: opts.q, mode: "insensitive" as const } }, { customer: { name: { contains: opts.q, mode: "insensitive" as const } } }, { customer: { phone: { contains: opts.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total, agg] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: [{ paymentDate: "desc" }, { id: "desc" }], take: opts.take ?? 25, skip: opts.skip ?? 0, include: { customer: { select: { id: true, name: true, code: true } }, method: true } }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } }),
  ]);
  return { rows, total, sum: agg._sum.amount };
}
