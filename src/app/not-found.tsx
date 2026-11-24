import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-muted"><SearchX className="size-6 text-muted-foreground" /></div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">This record or page does not exist.</p>
        <Button asChild className="mt-5"><Link href="/">Back to the dashboard</Link></Button>
      </div>
    </div>
  );
}
