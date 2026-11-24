import type { Db } from "./db";
import type { Actor } from "./actor";

function json(v: unknown) {
  if (v === undefined) return null;
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}

export async function audit(db: Db, actor: Actor | null, action: string, entity: string, entityId: string | number | bigint | null, summary?: string, before?: unknown, after?: unknown) {
  await db.auditLog.create({
    data: {
      userId: actor?.userId ?? null,
      action,
      entity,
      entityId: entityId === null ? null : String(entityId),
      summary: summary?.slice(0, 500) ?? null,
      before: json(before),
      after: json(after),
      ip: actor?.ip ?? null,
    },
  });
}
