"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { changePasswordAction } from "@/app/actions/auth";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <form action={action} className="grid gap-4">
      {state?.error && <Alert tone="danger" title={state.error} />}
      <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters, letters and digits"><Input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} /></Field>
      <Field label="Repeat new password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <Button type="submit" loading={pending} className="h-10">Save password</Button>
      <Link href="/" className="text-center text-sm text-muted-foreground hover:text-foreground">Back to the portal</Link>
    </form>
  );
}
