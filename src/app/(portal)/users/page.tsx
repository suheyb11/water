import { requirePage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listRoles, listUsers } from "@/server/services/users";
import { PageHeader, StatusBadge } from "@/components/common";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";
import { RoleEditor, UserEditor } from "./user-tools";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const actor = await requirePage("users.manage");
  const [users, roles, perms] = await Promise.all([listUsers(), listRoles(), prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] })]);
  const roleOpts = roles.map(r => ({ id: r.id, code: r.code, name: r.name }));
  return (
    <>
      <PageHeader title="Users & roles" description="Every user signs in with their own account; every financial action records who did it." actions={<UserEditor roles={roleOpts} />} />
      <Card>
        <Table>
          <THead><TR><TH>User</TH><TH>Roles</TH><TH>Last sign-in</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>{users.map(u => (
            <TR key={u.id}>
              <TD><p className="font-medium">{u.fullName}</p><p className="text-xs text-muted-foreground">{u.username}{u.phone ? ` · ${u.phone}` : ""}{u.mustChangePassword ? " · must change password" : ""}</p></TD>
              <TD><div className="flex flex-wrap gap-1">{u.roles.map(r => <Badge key={r.roleId} tone="primary">{r.role.name}</Badge>)}</div></TD>
              <TD className="text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}{u.lockedUntil && u.lockedUntil > new Date() ? <p className="text-destructive">locked</p> : null}</TD>
              <TD><StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} /></TD>
              <TD className="text-right"><UserEditor roles={roleOpts} isSelf={u.id === actor.userId} initial={{ id: u.id, username: u.username, fullName: u.fullName, email: u.email ?? "", phone: u.phone ?? "", roleIds: u.roles.map(r => r.roleId), isActive: u.isActive }} /></TD>
            </TR>
          ))}</TBody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Roles</CardTitle><CardDescription>Permissions are configurable per role. Super Admin always has everything.</CardDescription></div><RoleEditor permissions={perms} /></CardHeader>
        <CardContent className="px-0 pb-2">
          <Table><THead><TR><TH>Role</TH><TH>Description</TH><TH className="text-right">Users</TH><TH className="text-right">Permissions</TH><TH /></TR></THead>
            <TBody>{roles.map(r => (
              <TR key={r.id}><TD className="font-medium">{r.name}<p className="font-mono text-xs text-muted-foreground">{r.code}</p></TD><TD className="text-muted-foreground">{r.description}</TD><TD className="text-right">{r._count.users}</TD><TD className="text-right">{r.permissions.length}</TD>
                <TD className="text-right"><RoleEditor permissions={perms} initial={{ id: r.id, code: r.code, name: r.name, description: r.description ?? "", permissions: r.permissions.map(p => p.permission.code), isSystem: r.isSystem }} /></TD></TR>
            ))}</TBody></Table>
        </CardContent>
      </Card>
    </>
  );
}
