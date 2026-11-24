"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { signInAction } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert tone="danger" title={state.error} />}
      <Field label="Username" htmlFor="username"><Input id="username" name="username" autoComplete="username" autoFocus required /></Field>
      <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" loading={pending} className="mt-1 h-10">Sign in</Button>
    </form>
  );
}
