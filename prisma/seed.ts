// npm run db:seed — reference data + the first Super Admin. Prints the first password once and writes it to
// ADMIN-FIRST-LOGIN.txt (delete the file after the first sign-in; the password must be changed at first sign-in).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../src/server/db";
import { seedBase } from "../src/server/seed-base";

async function main() {
  await seedBase(prisma);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const existing = await prisma.user.findFirst({ where: { roles: { some: { roleId: role.id } } } });
  if (existing) {
    console.log(`Reference data up to date. Super Admin exists: ${existing.username}`);
    return;
  }
  const password = `Wp-${randomBytes(9).toString("base64url")}9`;
  await prisma.user.create({
    data: {
      username: "admin", fullName: "System Administrator", passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true,
      roles: { create: { roleId: role.id } },
    },
  });
  writeFileSync("ADMIN-FIRST-LOGIN.txt", `Water Portal first sign-in\nusername: admin\npassword: ${password}\n\nYou must choose a new password at first sign-in. Delete this file afterwards.\n`);
  console.log("Created Super Admin 'admin'. First password written to ADMIN-FIRST-LOGIN.txt");
}

main().then(() => prisma.$disconnect()).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
