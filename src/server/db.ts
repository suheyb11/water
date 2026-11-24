// Single Prisma client for the whole server, reached through the node-postgres driver adapter (Supabase PostgreSQL).
// On Vercel, DATABASE_URL is the Supabase pooler (Supavisor, transaction mode, port 6543); migrations use DIRECT_URL.
// Business logic in src/server/services uses only the Prisma API (no raw SQL).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  // Small pool per serverless instance; the Supabase pooler multiplexes them onto real connections.
  // `?schema=` in the URL (used by the test database) selects the Postgres schema; the default is public.
  let schema: string | undefined;
  try {
    schema = new URL(url).searchParams.get("schema") ?? undefined;
  } catch {
    throw new Error("DATABASE_URL is not a valid postgresql:// URL (see .env.example)");
  }
  const adapter = new PrismaPg({ connectionString: url, max: process.env.VERCEL ? 3 : 10 }, { schema });
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG ? ["query", "warn", "error"] : ["warn", "error"] });
}

const g = globalThis as unknown as { __prisma?: ReturnType<typeof createClient> };
export const prisma = g.__prisma ?? createClient();
g.__prisma = prisma; // reuse across hot reloads and warm serverless invocations

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
