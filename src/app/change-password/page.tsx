import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { currentActor } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { ChangePasswordForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const s = await getSettings();
  return (
    <AuthFrame title="Choose a new password" subtitle={actor.mustChangePassword ? "You must set your own password before you continue." : "At least 10 characters, with letters and digits."} company={s.companyName}>
      <ChangePasswordForm />
    </AuthFrame>
  );
}
