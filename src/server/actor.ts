import type { PermissionCode } from "@/lib/constants";
import { forbidden } from "./errors";

/** Who is doing something. Every service call that changes data takes an Actor. */
export interface Actor {
  userId: number;
  username: string;
  fullName: string;
  roles: string[];
  permissions: Set<PermissionCode>;
  ip?: string | null;
}

export function can(actor: Actor | null | undefined, p: PermissionCode) {
  return !!actor && actor.permissions.has(p);
}

export function assertCan(actor: Actor, ...perms: PermissionCode[]) {
  for (const p of perms) if (!actor.permissions.has(p)) forbidden(`Permission required: ${p}`);
}
