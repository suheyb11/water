import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummy: string | null = null;
/** Same work as a real check, so a wrong username takes as long as a wrong password. */
export async function dummyVerify(plain: string) {
  dummy ??= await bcrypt.hash("dummy-password-for-timing", ROUNDS);
  await bcrypt.compare(plain, dummy);
}

/** Minimum password policy: 10+ characters with letters and digits. */
export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Use at least 10 characters";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Use letters and digits";
  if (p.length > 200) return "Too long";
  return null;
}
