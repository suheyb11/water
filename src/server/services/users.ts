import { z } from "zod";
import { prisma, inTx } from "../db";
import type { Actor } from "../actor";
import { assertCan } from "../actor";
import { audit } from "../audit";
import { fail, notFound } from "../errors";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { ALL_PERMISSIONS, PERMISSIONS, type PermissionCode } from "@/lib/constants";

const pwd = z.string().superRefine((v, ctx) => { const p = passwordProblem(v); if (p) ctx.addIssue({ code: "custom", message: p }); });

export const userInput = z.object({
  username: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only"),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")).transform(v => v || null),
  phone: z.string().trim().max(40).optional().nullable().transform(v => v || null),
  roleIds: z.array(z.coerce.number().int().positive()).min(1, "Give the user at least one role"),
  isActive: z.boolean().optional().default(true),
  password: pwd.optional(),
});

export async function createUser(actor: Actor, raw: z.input<typeof userInput>) {
  assertCan(actor, "users.manage");
  const input = userInput.parse(raw);
  if (!input.password) fail("Set a first password", "VALIDATION", "password");
  return inTx(async tx => {
    if (await tx.user.findUnique({ where: { username: input.username } })) fail("This username is taken", "VALIDATION", "username");
    const user = await tx.user.create({
      data: {
        username: input.username, fullName: input.fullName, email: input.email, phone: input.phone, isActive: input.isActive,
        passwordHash: await hashPassword(input.password!), mustChangePassword: true,
        roles: { create: input.roleIds.map(roleId => ({ roleId })) },
      },
    });
    await audit(tx, actor, "user.create", "User", user.id, `${user.username} (${user.fullName})`, null, { ...user, passwordHash: undefined, roleIds: input.roleIds });
    return user;
  });
}

export async function updateUser(actor: Actor, id: number, raw: z.input<typeof userInput>) {
  assertCan(actor, "users.manage");
  const input = userInput.parse(raw);
  return inTx(async tx => {
    const before = await tx.user.findUnique({ where: { id }, include: { roles: true } });
    if (!before) return notFound("User");
    if (id === actor.userId && !input.isActive) fail("You cannot disable your own account");
    if (input.username !== before.username && (await tx.user.findUnique({ where: { username: input.username } }))) fail("This username is taken", "VALIDATION", "username");
    // never remove the last active Super Admin
    const superRole = await tx.role.findUnique({ where: { code: "SUPER_ADMIN" } });
    if (superRole && before.roles.some(r => r.roleId === superRole.id) && (!input.roleIds.includes(superRole.id) || !input.isActive)) {
      const others = await tx.userRole.count({ where: { roleId: superRole.id, userId: { not: id }, user: { isActive: true } } });
      if (!others) fail("This is the last active Super Admin");
    }
    await tx.userRole.deleteMany({ where: { userId: id } });
    const after = await tx.user.update({
      where: { id },
      data: {
        username: input.username, fullName: input.fullName, email: input.email, phone: input.phone, isActive: input.isActive,
        ...(input.password ? { passwordHash: await hashPassword(input.password), mustChangePassword: true, failedLogins: 0, lockedUntil: null } : {}),
        roles: { create: input.roleIds.map(roleId => ({ roleId })) },
      },
    });
    if (!input.isActive || input.password) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "user.update", "User", id, `${after.username}${input.password ? " (password reset)" : ""}`, { ...before, passwordHash: undefined }, { ...after, passwordHash: undefined, roleIds: input.roleIds });
    return after;
  });
}

export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  const problem = passwordProblem(next);
  if (problem) fail(problem, "VALIDATION", "next");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) fail("The current password is wrong", "VALIDATION", "current");
  if (current === next) fail("Choose a new password", "VALIDATION", "next");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await audit(prisma, actor, "user.password_change", "User", user.id, "Changed own password");
}

export const roleInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_]+$/i).transform(s => s.toUpperCase()),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional().nullable().transform(v => v || null),
  permissions: z.array(z.string()).transform(list => list.filter((p): p is PermissionCode => p in PERMISSIONS)),
});

export async function saveRole(actor: Actor, raw: z.input<typeof roleInput>) {
  assertCan(actor, "users.manage");
  const { id, permissions, ...data } = roleInput.parse(raw);
  return inTx(async tx => {
    const existing = id ? await tx.role.findUnique({ where: { id } }) : null;
    if (id && !existing) return notFound("Role");
    if (existing?.code === "SUPER_ADMIN" && permissions.length !== ALL_PERMISSIONS.length) fail("Super Admin always has every permission");
    const dup = await tx.role.findFirst({ where: { code: data.code, ...(id ? { NOT: { id } } : {}) } });
    if (dup) fail("A role with this code exists", "VALIDATION", "code");
    const role = id ? await tx.role.update({ where: { id }, data: existing?.isSystem ? { name: data.name, description: data.description } : data }) : await tx.role.create({ data });
    const all = await tx.permission.findMany();
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const p of all.filter(p => permissions.includes(p.code as PermissionCode))) await tx.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    await audit(tx, actor, id ? "role.update" : "role.create", "Role", role.id, `${role.name}: ${permissions.length} permissions`, null, { permissions });
    return role;
  });
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { username: "asc" }, include: { roles: { include: { role: true } } } });
}
export async function listRoles() {
  return prisma.role.findMany({ orderBy: { id: "asc" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
}
export async function listDeliveryStaff() {
  return prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: { code: { in: ["deliveries.update", "deliveries.manage"] } } } } } } } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } });
}
