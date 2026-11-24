import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { currentActor } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentActor()) redirect("/");
  const { next } = await searchParams;
  const s = await getSettings();
  return (
    <AuthFrame title="Sign in" subtitle="Use the account your administrator gave you." company={s.companyName}>
      <LoginForm next={next ?? "/"} />
    </AuthFrame>
  );
}
