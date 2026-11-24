import { AppShell } from "@/components/app-shell";
import { requirePage } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage();
  const s = await getSettings();
  const me = {
    userId: actor.userId, username: actor.username, fullName: actor.fullName, roles: actor.roles,
    permissions: [...actor.permissions], companyName: s.companyName, currencySymbol: s.currencySymbol,
  };
  return <AppShell me={me}>{children}</AppShell>;
}
