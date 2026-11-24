import type { Db, Tx } from "./db";

export const SERIES = ["INV", "RCPT", "CN", "DLV", "EXP"] as const;

/**
 * Next number of a document series, unique under concurrency: the UPDATE takes a row lock on the sequence row
 * until the posting transaction commits; a rollback also gives the number back (no gaps from failed postings).
 * Everything happens on the transaction's own connection, so it can never wait on itself.
 */
export async function nextNumber(tx: Tx, series: string, prefix: string, year: number | null, width = 6): Promise<string> {
  const key = year ? `${series}-${year}` : series;
  const updated = await tx.documentSequence.updateMany({ where: { key }, data: { nextValue: { increment: 1 } } });
  let n: number;
  if (updated.count === 0) {
    // first document of this series/year (rows are normally pre-created by ensureSequences)
    await tx.documentSequence.create({ data: { key, nextValue: 2 } });
    n = 1;
  } else {
    const row = await tx.documentSequence.findUniqueOrThrow({ where: { key } });
    n = row.nextValue - 1;
  }
  return year ? `${prefix}-${year}-${String(n).padStart(width, "0")}` : `${prefix}-${String(n).padStart(width, "0")}`;
}

/** Pre-create the sequence rows for this and next year so concurrent first postings never race on creation. */
export async function ensureSequences(db: Db, year = new Date().getUTCFullYear()) {
  const keys = ["CUS", ...SERIES.flatMap(s => [`${s}-${year}`, `${s}-${year + 1}`])];
  for (const key of keys) {
    const exists = await db.documentSequence.findUnique({ where: { key } });
    if (!exists) await db.documentSequence.create({ data: { key, nextValue: 1 } }).catch(() => undefined);
  }
}
