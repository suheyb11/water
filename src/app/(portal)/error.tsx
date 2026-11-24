"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></div>
        <h1 className="text-lg font-semibold">This page could not be loaded</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Nothing was changed. Check that the database server is running, then try again.</p>
        <Button className="mt-5" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
