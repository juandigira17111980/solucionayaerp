import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, KeyRound, MailPlus, ShieldCheck, User, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, StatCard } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/seguridad")({ component: SeguridadPage });

const sb = supabase as any;

const ROLES = [
  "super_admin",
  "admin",
  "gerente",
  "contador",
  "vendedor",
  "comprador",
  "bodeguero",
  "usuario",
] as const;

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  gerente: "Gerente",
  contador: "Contador",
  vendedor: "Vendedor",
  comprador: "Comprador",
  bodeguero: "Bodeguero",
  usuario: "Usuario",
};

type Member = {
  user_id: string;
  company_id: string;
  is_default: boolean;
  profile?: { full_name: string | null; email: string | null; is_active: boolean } | null;
  roles: string[];
  permissions: Array<{ permission_code: string; effect: boolean; reason: string | null }>;
  warehouses: Array<{ warehouse_id: string; can_view: boolean; can_operate: boolean }>;
};

function SeguridadPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Administracion" title="Seguridad" />
        <EmptyState
          icon={ShieldCheck}
          title="Sin empresa activa"
          description="Selecciona o crea una empresa para administrar usuarios, roles y permisos."
        />
      </div>
    );
  }

  return (
    <SecurityWorkspace
      companyId={activeCompanyId}
      companyName={activeCompany?.trade_name ?? activeCompany?.legal_name ?? "Empresa activa"}
    />
  );
}

function SecurityWorkspace({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { data: canManage = false } = useQuery({
    queryKey: ["security-can-manage", companyId],
    queryFn: async () => {
      const { data, error } = await sb.rpc("can_manage_company_security", { _company_id: companyId });
      if (error) return false;
      return Boolean(data);
    },
  });

  const membersQuery = useSecurityMembers(companyId);
  const permissionsQuery = usePermissions();
  const warehousesQuery = useWarehouses(companyId);
  const invitationsQuery = useInvitations(companyId);

  const members = membersQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Administracion"
        title="Seguridad"
        description={`Usuarios, roles, permisos y acceso por bodega - ${companyName}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuarios" value={members.length} icon={User} />
        <StatCard label="Permisos" value={permissions.length} icon={KeyRound} />
        <StatCard label="Bodegas" value={warehouses.length} icon={Warehouse} />
        <StatCard
          label="Invitaciones"
          value={invitations.filter((i: any) => i.status === "pendiente").length}
          icon={MailPlus}
        />
      </div>

      {!canManage && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Tienes acceso de consulta. Para modificar roles, permisos o bodegas necesitas el permiso
          <span className="font-mono"> security.manage</span> o rol administrador.
        </div>
      )}

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usuarios">
            <User className="mr-2 size-4" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="permisos">
            <KeyRound className="mr-2 size-4" /> Permisos
          </TabsTrigger>
          <TabsTrigger value="bodegas">
            <Warehouse className="mr-2 size-4" /> Bodegas
          </TabsTrigger>
          <TabsTrigger value="invitaciones">
            <MailPlus className="mr-2 size-4" /> Invitaciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <UsersPanel companyId={companyId} members={members} canManage={canManage} />
        </TabsContent>
        <TabsContent value="permisos">
          <PermissionsPanel
            companyId={companyId}
            members={members}
            permissions={permissions}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="bodegas">
          <WarehouseAccessPanel
            companyId={companyId}
            members={members}
            warehouses={warehouses}
            canManage={canManage}
          />
        </TabsContent>
        <TabsContent value="invitaciones">
          <InvitationsPanel
            companyId={companyId}
            invitations={invitations}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useSecurityMembers(companyId: string) {
  return useQuery({
    queryKey: ["security-members", companyId],
    queryFn: async (): Promise<Member[]> => {
      const { data: companyUsers, error: ucError } = await sb
        .from("user_companies")
        .select("user_id, company_id, is_default")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (ucError) throw ucError;

      const userIds = [...new Set((companyUsers ?? []).map((u: any) => u.user_id))];
      if (userIds.length === 0) return [];

      const [{ data: profiles }, { data: roles }, { data: userPerms }, { data: warehouseAccess }] =
        await Promise.all([
          sb.from("profiles").select("id, full_name, email, is_active").in("id", userIds),
          sb.from("user_roles").select("user_id, role, company_id").in("user_id", userIds),
          sb
            .from("user_permissions")
            .select("user_id, permission_code, effect, reason")
            .eq("company_id", companyId)
            .in("user_id", userIds),
          sb
            .from("user_warehouse_access")
            .select("user_id, warehouse_id, can_view, can_operate")
            .eq("company_id", companyId)
            .in("user_id", userIds),
        ]);

      return (companyUsers ?? []).map((uc: any) => ({
        user_id: uc.user_id,
        company_id: uc.company_id,
        is_default: uc.is_default,
        profile: (profiles ?? []).find((p: any) => p.id === uc.user_id) ?? null,
        roles: (roles ?? [])
          .filter((r: any) => r.user_id === uc.user_id && (!r.company_id || r.company_id === companyId))
          .map((r: any) => r.role),
        permissions: (userPerms ?? []).filter((p: any) => p.user_id === uc.user_id),
        warehouses: (warehouseAccess ?? []).filter((w: any) => w.user_id === uc.user_id),
      }));
    },
  });
}

function usePermissions() {
  return useQuery({
    queryKey: ["security-permissions"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("permissions")
        .select("code, module, action, description")
        .order("module")
        .order("action");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useWarehouses(companyId: string) {
  return useQuery({
    queryKey: ["security-warehouses", companyId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("warehouses")
        .select("id, code, name, warehouse_type, is_active")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvitations(companyId: string) {
  return useQuery({
    queryKey: ["security-invitations", companyId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("security_invitations")
        .select("id, email, role, status, expires_at, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function UsersPanel({
  companyId,
  members,
  canManage,
}: {
  companyId: string;
  members: Member[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("usuario");

  const assignRole = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("Selecciona un usuario");
      const { error } = await sb.from("user_roles").upsert(
        {
          user_id: selectedUser,
          company_id: companyId,
          role: selectedRole,
        },
        { onConflict: "user_id,role,company_id" },
      );
      if (error) throw error;
      await logSecurity(companyId, "role.assigned", "user_roles", selectedUser, {
        role: selectedRole,
      });
    },
    onSuccess: () => {
      toast.success("Rol asignado");
      qc.invalidateQueries({ queryKey: ["security-members", companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo asignar el rol"),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 md:flex-row md:items-end">
          <div className="grid gap-1.5 md:w-80">
            <Label>Usuario</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona usuario" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 md:w-56">
            <Label>Rol a asignar</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r !== "super_admin").map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={assignRole.isPending} onClick={() => assignRole.mutate()}>
            Asignar rol
          </Button>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Permisos directos</TableHead>
              <TableHead>Bodegas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell className="font-medium">{memberName(m)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.profile?.email ?? "Sin email"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.length === 0 ? (
                      <Badge variant="outline">Sin rol</Badge>
                    ) : (
                      m.roles.map((r) => (
                        <Badge key={r} variant="secondary">
                          {ROLE_LABEL[r] ?? r}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>{m.permissions.length}</TableCell>
                <TableCell>{m.warehouses.length}</TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState icon={User} title="Sin usuarios" description="No hay usuarios asociados." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PermissionsPanel({
  companyId,
  members,
  permissions,
  canManage,
}: {
  companyId: string;
  members: Member[];
  permissions: any[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [permissionCode, setPermissionCode] = useState("");
  const [effect, setEffect] = useState("allow");
  const [reason, setReason] = useState("");

  const grouped = useMemo(() => {
    return permissions.reduce<Record<string, any[]>>((acc, p) => {
      acc[p.module] = acc[p.module] ?? [];
      acc[p.module].push(p);
      return acc;
    }, {});
  }, [permissions]);

  const savePermission = useMutation({
    mutationFn: async () => {
      if (!userId || !permissionCode) throw new Error("Selecciona usuario y permiso");
      const { error } = await sb.from("user_permissions").upsert(
        {
          user_id: userId,
          company_id: companyId,
          permission_code: permissionCode,
          effect: effect === "allow",
          reason: reason || null,
        },
        { onConflict: "user_id,company_id,permission_code" },
      );
      if (error) throw error;
      await logSecurity(companyId, "permission.changed", "user_permissions", userId, {
        permission_code: permissionCode,
        effect,
      });
    },
    onSuccess: () => {
      toast.success("Permiso actualizado");
      setReason("");
      qc.invalidateQueries({ queryKey: ["security-members", companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar el permiso"),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="font-semibold">Excepcion por usuario</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Permite o deniega un permiso especifico sin cambiar la plantilla del rol.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={setUserId} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona usuario" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Permiso</Label>
            <Select value={permissionCode} onValueChange={setPermissionCode} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona permiso" />
              </SelectTrigger>
              <SelectContent>
                {permissions.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Efecto</Label>
            <Select value={effect} onValueChange={setEffect} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Permitir</SelectItem>
                <SelectItem value="deny">Denegar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Motivo</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!canManage}
              placeholder="Opcional"
            />
          </div>
          <Button disabled={!canManage || savePermission.isPending} onClick={() => savePermission.mutate()}>
            Guardar permiso
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modulo</TableHead>
              <TableHead>Permisos disponibles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(grouped).map(([module, rows]) => (
              <TableRow key={module}>
                <TableCell className="font-medium capitalize">{module}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {rows.map((p) => (
                      <Badge key={p.code} variant="outline" title={p.description}>
                        {p.code}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WarehouseAccessPanel({
  companyId,
  members,
  warehouses,
  canManage,
}: {
  companyId: string;
  members: Member[];
  warehouses: any[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [canView, setCanView] = useState(true);
  const [canOperate, setCanOperate] = useState(false);

  const saveAccess = useMutation({
    mutationFn: async () => {
      if (!userId || !warehouseId) throw new Error("Selecciona usuario y bodega");
      const { error } = await sb.from("user_warehouse_access").upsert(
        {
          user_id: userId,
          company_id: companyId,
          warehouse_id: warehouseId,
          can_view: canView,
          can_operate: canOperate,
        },
        { onConflict: "user_id,warehouse_id" },
      );
      if (error) throw error;
      await logSecurity(companyId, "warehouse_access.changed", "user_warehouse_access", userId, {
        warehouse_id: warehouseId,
        can_view: canView,
        can_operate: canOperate,
      });
    },
    onSuccess: () => {
      toast.success("Acceso a bodega actualizado");
      qc.invalidateQueries({ queryKey: ["security-members", companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar el acceso"),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="grid gap-3 rounded-md border border-border bg-card p-4 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona usuario" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Bodega</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona bodega" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={canView} onChange={(e) => setCanView(e.target.checked)} />
            Ver
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canOperate}
              onChange={(e) => setCanOperate(e.target.checked)}
            />
            Operar
          </label>
          <Button disabled={saveAccess.isPending} onClick={() => saveAccess.mutate()}>
            Guardar
          </Button>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Accesos por bodega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell className="font-medium">{memberName(m)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {m.warehouses.length === 0 ? (
                      <Badge variant="outline">Sin bodegas asignadas</Badge>
                    ) : (
                      m.warehouses.map((access) => {
                        const w = warehouses.find((x) => x.id === access.warehouse_id);
                        return (
                          <Badge key={access.warehouse_id} variant="secondary">
                            {w?.code ?? "Bodega"} {access.can_operate ? "operar" : "ver"}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InvitationsPanel({
  companyId,
  invitations,
  canManage,
}: {
  companyId: string;
  invitations: any[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("usuario");

  const createInvitation = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error("Ingresa el email");
      const { data: user } = await supabase.auth.getUser();
      const { error } = await sb.from("security_invitations").insert({
        company_id: companyId,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.user?.id,
      });
      if (error) throw error;
      await logSecurity(companyId, "invitation.created", "security_invitations", email, { role });
    },
    onSuccess: () => {
      toast.success("Invitacion registrada");
      setEmail("");
      setRole("usuario");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["security-invitations", companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo crear la invitacion"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canManage}>
              <MailPlus className="mr-2 size-4" /> Nueva invitacion
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva invitacion</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              </div>
              <div className="grid gap-1.5">
                <Label>Rol sugerido</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((r) => r !== "super_admin").map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={createInvitation.isPending} onClick={() => createInvitation.mutate()}>
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Expira</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.email}</TableCell>
                <TableCell>{ROLE_LABEL[i.role] ?? i.role}</TableCell>
                <TableCell>
                  <Badge variant={i.status === "pendiente" ? "secondary" : "outline"}>{i.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(i.expires_at).toLocaleDateString("es-CO")}
                </TableCell>
              </TableRow>
            ))}
            {invitations.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState
                    icon={MailPlus}
                    title="Sin invitaciones"
                    description="Registra invitaciones para controlar altas de usuarios por empresa."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function logSecurity(companyId: string, action: string, entity: string, entityId: string, changes: any) {
  await sb.rpc("log_security_event", {
    _company_id: companyId,
    _action: action,
    _entity: entity,
    _entity_id: entityId,
    _changes: changes,
  });
}

function memberName(member: Member) {
  return member.profile?.full_name || member.profile?.email || member.user_id.slice(0, 8);
}
