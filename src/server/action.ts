import "server-only";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { AppError } from "./errors";
import { currentActor } from "./auth/session";
import type { Actor } from "./actor";
import { plain } from "@/lib/plain";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

/**
 * Wrap a service call for a Server Action: resolves the signed-in user, turns validation and business errors
 * into messages for the form, never leaks internal errors, and refreshes the pages afterwards.
 */
export async function runAction<T>(fn: (actor: Actor) => Promise<T>): Promise<ActionResult<ReturnType<typeof plain<T>>>> {
  const actor = await currentActor();
  if (!actor) return { ok: false, error: "Your session has ended. Sign in again.", code: "UNAUTHENTICATED" };
  try {
    const data = await fn(actor);
    revalidatePath("/", "layout");
    return { ok: true, data: plain(data) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code, ...(e.field ? { fieldErrors: { [e.field]: e.message } } : {}) };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) { const k = i.path.join("."); if (!fieldErrors[k]) fieldErrors[k] = i.message; }
      const first = e.issues[0];
      return { ok: false, error: first ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}` : "Check the form", fieldErrors, code: "VALIDATION" };
    }
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Nothing was saved. Try again or contact the administrator.", code: "INTERNAL" };
  }
}
