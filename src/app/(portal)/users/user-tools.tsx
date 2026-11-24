"use client";
import * as React from "react";
import { KeyRound, Pencil, Plus, ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Checkbox, Field, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useAction } from "@/components/client-kit";
import { createUserAction, saveRoleAction, updateUserAction } from "@/app/actions/mutations";

interface Role { id: number; code: string; name: string }
export interface UserRow { id?: number; username: string; fullName: string; email: string; phone: string; roleIds: number[]; isActive: boolean }

export function UserEditor({ roles, initial, isSelf }: { roles: Role[]; initial?: UserRow; isSelf?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const blank: UserRow = { username: "", fullName: "", email: "", phone: "", roleIds: [], isActive: true };
  const [v, setV] = React.useState<UserRow>(initial ?? blank);
  const [pw, setPw] = React.useState("");
  const done = () => { setOpen(false); setPw(""); if (!initial) setV(blank); };
  const create = useAction(createUserAction, { success: "User created — they must change the password at first sign-in", onSuccess: done });
  const update = useAction(updateUserAction, { success: "User saved", onSuccess: done });
  const a = initial ? update : create;
  const gen = () => setPw(`Wp-${Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("")}7`);
  return (
    <>
      {initial ? <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label={`Edit ${initial.username}`}><Pencil /></Button> : <Button onClick={() => setOpen(true)}><Plus />Add user</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={initial ? `Edit ${initial.username}` : "Add user"}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); const body = { ...v, email: v.email || null, phone: v.phone || null, ...(pw ? { password: pw } : {}) }; if (initial?.id) update.run(initial.id, body); else create.run(body); }}>
            {a.error && <Alert tone="danger" title={a.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username *" error={a.errors.username}><Input value={v.username} onChange={e => setV({ ...v, username: e.target.value.toLowerCase() })} autoComplete="off" /></Field>
              <Field label="Full name *" error={a.errors.fullName}><Input value={v.fullName} onChange={e => setV({ ...v, fullName: e.target.value })} /></Field>
              <Field label="Phone"><Input value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
              <Field label="E-mail" error={a.errors.email}><Input value={v.email} onChange={e => setV({ ...v, email: e.target.value })} /></Field>
            </div>
            <Field label="Roles *" error={a.errors.roleIds}>
              <div className="grid gap-1.5 sm:grid-cols-2">{roles.map(r => (
                <label key={r.id} className="flex items-center gap-2 text-sm"><Checkbox checked={v.roleIds.includes(r.id)} onCheckedChange={c => setV({ ...v, roleIds: c ? [...v.roleIds, r.id] : v.roleIds.filter(x => x !== r.id) })} />{r.name}</label>
              ))}</div>
            </Field>
            <Field label={initial ? "Reset password (optional)" : "First password *"} hint="10+ characters with letters and digits. The user must change it at first sign-in." error={a.errors.password}>
              <div className="flex gap-2"><Input value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /><Button type="button" variant="outline" onClick={gen}><KeyRound />Generate</Button></div>
            </Field>
            {initial && !isSelf && <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.isActive} onCheckedChange={c => setV({ ...v, isActive: !!c })} />Account active (disabling signs the user out everywhere)</label>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={a.busy}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RoleEditor({ permissions, initial }: { permissions: { code: string; module: string; description: string }[]; initial?: { id: number; code: string; name: string; description: string; permissions: string[]; isSystem: boolean } }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial ?? { id: 0, code: "", name: "", description: "", permissions: [] as string[], isSystem: false });
  const save = useAction(saveRoleAction, { success: "Role saved", onSuccess: () => setOpen(false) });
  const modules = [...new Set(permissions.map(p => p.module))];
  return (
    <>
      {initial ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil />Permissions</Button> : <Button variant="outline" onClick={() => setOpen(true)}><ShieldPlus />Add role</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title={initial ? `Role: ${initial.name}` : "Add role"}>
          <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.run({ ...(v.id ? { id: v.id } : {}), code: v.code, name: v.name, description: v.description || null, permissions: v.permissions }); }}>
            {save.error && <Alert tone="danger" title={save.error} />}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Code"><Input value={v.code} disabled={v.isSystem} onChange={e => setV({ ...v, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
              <Field label="Description"><Input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></Field>
            </div>
            <div className="grid max-h-[50vh] gap-4 overflow-y-auto sm:grid-cols-2">
              {modules.map(m => (
                <div key={m} className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m}</p>
                  {permissions.filter(p => p.module === m).map(p => (
                    <label key={p.code} className="flex items-start gap-2 py-1 text-sm"><Checkbox className="mt-0.5" checked={v.permissions.includes(p.code)} onCheckedChange={c => setV({ ...v, permissions: c ? [...v.permissions, p.code] : v.permissions.filter(x => x !== p.code) })} />
                      <span>{p.description}<span className="block font-mono text-[11px] text-muted-foreground">{p.code}</span></span></label>
                  ))}
                </div>
              ))}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={save.busy}>Save role</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
