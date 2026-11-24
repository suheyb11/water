"use client";
import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { saveLocationAction } from "@/app/actions/mutations";

type Kind = "DISTRICT" | "NEIGHBORHOOD" | "PLACE";
export interface LocRow { id?: number; kind: Kind; name: string; alsoKnownAs: string; description: string; parentId: string; latitude: string; longitude: string; isActive: boolean }
const KIND_LABEL: Record<Kind, string> = { DISTRICT: "District", NEIGHBORHOOD: "Neighbourhood", PLACE: "Local place / landmark" };
const PARENT: Record<Kind, Kind | null> = { DISTRICT: null, NEIGHBORHOOD: "DISTRICT", PLACE: "NEIGHBORHOOD" };

export function LocationEditor({ all, initial, trigger }: { all: { id: number; kind: string; name: string }[]; initial?: LocRow; trigger: "new" | "edit" }) {
  const [open, setOpen] = React.useState(false);
  const blank: LocRow = { kind: "PLACE", name: "", alsoKnownAs: "", description: "", parentId: "", latitude: "", longitude: "", isActive: true };
  const [v, setV] = React.useState<LocRow>(initial ?? blank);
  const save = useAction(saveLocationAction, { success: "Location saved", onSuccess: () => { setOpen(false); if (!initial) setV(blank); } });
  const parents = all.filter(l => l.kind === PARENT[v.kind]);
  return (
    <>
      {trigger === "new" ? <Button onClick={() => setOpen(true)}><Plus />Add location</Button> : <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="Edit"><Pencil /></Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={initial ? `Edit ${initial.name}` : "Add location"} description="Use the names local people use, even if they are not on any map.">
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ ...(v.id ? { id: v.id } : {}), kind: v.kind, name: v.name, alsoKnownAs: v.alsoKnownAs || null, description: v.description || null, parentId: v.parentId || null, latitude: v.latitude || null, longitude: v.longitude || null, isActive: v.isActive }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kind"><select className="h-9 rounded-md border bg-card px-2 text-sm" value={v.kind} disabled={!!initial} onChange={e => setV({ ...v, kind: e.target.value as Kind, parentId: "" })}>{(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
              {PARENT[v.kind] && <Field label={`Inside ${KIND_LABEL[PARENT[v.kind]!].toLowerCase()} (optional)`}><select className="h-9 rounded-md border bg-card px-2 text-sm" value={v.parentId} onChange={e => setV({ ...v, parentId: e.target.value })}><option value="">—</option>{parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
            </div>
            <Field label="Name *" error={save.errors.name}><Input autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="e.g. Isgoyska Dabka" /></Field>
            <Field label="Also known as" hint="Other names people use, separated by commas"><Input value={v.alsoKnownAs} onChange={e => setV({ ...v, alsoKnownAs: e.target.value })} /></Field>
            <Field label="Description"><Textarea rows={2} value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="Near the big tree, behind the petrol station…" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" error={save.errors.latitude}><Input value={v.latitude} onChange={e => setV({ ...v, latitude: e.target.value })} /></Field>
              <Field label="Longitude" error={save.errors.longitude}><Input value={v.longitude} onChange={e => setV({ ...v, longitude: e.target.value })} /></Field>
            </div>
            {initial && <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.isActive} onCheckedChange={c => setV({ ...v, isActive: !!c })} />Active (shown in address lists)</label>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
