"use server";
import { redirect } from "next/navigation";
import { login, logout, currentActor, currentSessionRaw, revokeUserSessions } from "@/server/auth/session";
import { changeOwnPassword } from "@/server/services/users";
import { AppError } from "@/server/errors";

export async function signInAction(_prev: unknown, form: FormData): Promise<{ error?: string }> {
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password" };
  const r = await login(username, password);
  if (!r.ok) return { error: r.error };
  const next = String(form.get("next") ?? "/");
  redirect(r.mustChangePassword ? "/change-password" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOutAction() {
  await logout();
}

export async function changePasswordAction(_prev: unknown, form: FormData): Promise<{ error?: string; field?: string }> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "The two new passwords are different", field: "confirm" };
  try {
    await changeOwnPassword(actor, current, next);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, field: e.field };
    throw e;
  }
  await revokeUserSessions(actor.userId, await currentSessionRaw());
  redirect("/");
}
