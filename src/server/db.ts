// Single Prisma client for the whole server. The database is reached through a driver adapter, so moving to
// PostgreSQL later means: provider in schema.prisma, @prisma/adapter-pg here, new migrations. Business logic in
// src/server/services uses only the Prisma API (no raw SQL except the portable UPDATE row locks in posting.ts).
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  const adapter = new PrismaMssql(url);
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"] });
}

const g = globalThis as unknown as { __prisma?: ReturnType<typeof createClient> };
export const prisma = g.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = typeof prisma | Tx;

/** Run a financial posting atomically. Row locks taken inside (see lockCustomer) serialise concurrent postings. */
export function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 10_000,
    timeout: 30_000,
  });
}

export { Prisma };
