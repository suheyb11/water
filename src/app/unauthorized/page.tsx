import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

export default function Unauthorized() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><ShieldAlert className="size-6" /></div>
        <h1 className="text-xl font-semibold">You do not have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask an administrator to give your role the permission you need.</p>
        <Button asChild className="mt-6"><Link href="/">Back to the portal</Link></Button>
      </div>
    </div>
  );
}
