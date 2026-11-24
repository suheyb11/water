// Server-side sessions: the browser holds an opaque random id (httpOnly cookie); the session row decides.
// Sessions can be revoked (logout, password change, user disabled) and expire after inactivity.
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db";
import type { Actor } from "../actor";
import type { PermissionCode } from "@/lib/constants";
import { dummyVerify, verifyPassword } from "./password";

export const SESSION_COOKIE = "wp_session";
const IDLE_HOURS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const hashId = (raw: string) => createHash("sha256").update(raw).digest("hex");

async function clientInfo() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").slice(0, 64), ua: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function login(username: string, password: string): Promise<{ ok: true; mustChangePassword: boolean } | { ok: false; error: string }> {
  const { ip, ua } = await clientInfo();
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  const generic = { ok: false as const, error: "Wrong username or password" };
  if (!user) { await dummyVerify(password); return generic; }
  if (!user.isActive) return { ok: false, error: "This account is disabled" };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login_failed", entity: "User", entityId: String(user.id), summary: `Failed sign-in (${failed})`, ip } });
    return generic;
  }
  const raw = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { id: hashId(raw), userId: user.id, expiresAt: new Date(Date.now() + IDLE_HOURS * 3_600_000), ip, userAgent: ua } });
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login", entity: "User", entityId: String(user.id), summary: "Signed in", ip } });
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: IDLE_HOURS * 3600 });
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await prisma.session.updateMany({ where: { id: hashId(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export async function loadActor(rawId: string | undefined, ip?: string): Promise<(Actor & { mustChangePassword: boolean }) | null> {
  if (!rawId) return null;
  const s = await prisma.session.findUnique({
    where: { id: hashId(rawId) },
    include: { user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
  });
  if (!s || s.revokedAt || s.expiresAt < new Date() || !s.user.isActive) return null;
  // sliding expiry, written at most every 5 minutes
  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + IDLE_HOURS * 3_600_000) } }).catch(() => undefined);
  }
  const perms = new Set<PermissionCode>();
  for (const ur of s.user.roles) for (const rp of ur.role.permissions) perms.add(rp.permission.code as PermissionCode);
  return {
    userId: s.user.id, username: s.user.username, fullName: s.user.fullName, roles: s.user.roles.map(r => r.role.name),
    permissions: perms, ip: ip ?? s.ip, mustChangePassword: s.user.mustChangePassword,
  };
}

/** Current user for this request (cached per request). */
export const currentActor = cache(async () => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const { ip } = await clientInfo();
  return loadActor(raw, ip);
});

/** For pages: redirect to sign-in when there is no session, to /unauthorized when a permission is missing. */
export async function requirePage(...perms: PermissionCode[]) {
  const a = await currentActor();
  if (!a) redirect("/login");
  if (a.mustChangePassword) redirect("/change-password");
  if (perms.length && !perms.some(p => a.permissions.has(p))) redirect("/unauthorized");
  return a;
}

export async function revokeUserSessions(userId: number, exceptRaw?: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null, ...(exceptRaw ? { NOT: { id: hashId(exceptRaw) } } : {}) }, data: { revokedAt: new Date() } });
}

export async function currentSessionRaw() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
