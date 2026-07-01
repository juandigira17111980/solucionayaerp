import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/erp/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/seguridad")({ component: SeguridadPage });

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

function SeguridadPage() {
  const { data: myRoles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return [];
      const { data } = await supabase.from("user_roles").select("*").eq("user_id", userRes.user.id);
      return data ?? [];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", userRes.user.id).maybeSingle();
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Seguridad"
        description="Roles, permisos y control de acceso. La gestión avanzada de usuarios y roles llegará con la Fase 1 completa."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <User className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{profile?.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
          </div>
          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Mis roles</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myRoles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles asignados</span>}
            {myRoles.map((r) => (
              <Badge key={r.id} variant="secondary" className="gap-1">
                <ShieldCheck className="size-3" />
                {ROLE_LABEL[r.role] ?? r.role}
              </Badge>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-semibold">Roles disponibles en el sistema</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { r: "super_admin", d: "Acceso total. Puede gestionar empresas, usuarios y roles." },
                { r: "admin", d: "Administra empresas, maestros y transacciones." },
                { r: "gerente", d: "Consulta reportería y aprueba operaciones." },
                { r: "contador", d: "Módulos contables y financieros." },
                { r: "vendedor", d: "Ventas, POS, cotizaciones, clientes." },
                { r: "comprador", d: "Cotizaciones y órdenes de compra." },
                { r: "bodeguero", d: "Movimientos de inventario y bodegas." },
                { r: "usuario", d: "Rol base con permisos mínimos." },
              ].map((row) => (
                <TableRow key={row.r}>
                  <TableCell><Badge variant="outline">{ROLE_LABEL[row.r]}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{row.d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
