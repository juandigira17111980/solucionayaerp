import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Package, Warehouse, Users, Boxes, ArrowUpRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader, StatCard, ComingSoon } from "@/components/erp/page-header";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { activeCompany, activeCompanyId, companies } = useActiveCompany();

  const stats = useQuery({
    queryKey: ["dashboard-stats", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const [products, warehouses, thirds, categories] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId!),
        supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId!),
        supabase.from("third_parties").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId!),
        supabase.from("product_categories").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId!),
      ]);
      return {
        products: products.count ?? 0,
        warehouses: warehouses.count ?? 0,
        thirds: thirds.count ?? 0,
        categories: categories.count ?? 0,
      };
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="General"
        title={activeCompany ? `Panel de ${activeCompany.trade_name ?? activeCompany.legal_name}` : "Dashboard"}
        description="Resumen de la operación. Los KPIs se actualizan en tiempo real conforme registras información."
      />

      {companies.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Empresas" value={companies.length} icon={Building2} hint="a las que tienes acceso" />
            <StatCard label="Bodegas" value={stats.data?.warehouses ?? "—"} icon={Warehouse} />
            <StatCard label="Productos" value={stats.data?.products ?? "—"} icon={Package} />
            <StatCard label="Terceros" value={stats.data?.thirds ?? "—"} icon={Users} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Estado de la implementación</h3>
                <span className="text-xs text-muted-foreground">Roadmap</span>
              </div>
              <ul className="mt-4 space-y-3 text-sm">
                {[
                  { label: "Fase 0 · Fundaciones", done: true },
                  { label: "Fase 1 · Seguridad, empresas, bodegas, maestros", done: true },
                  { label: "Fase 2 · Inventarios (kardex, movimientos, existencias)" },
                  { label: "Fase 3 · Compras" },
                  { label: "Fase 4 · Ventas + POS" },
                  { label: "Fase 5 · Cartera, CxP, Tesorería" },
                  { label: "Fase 6 · Contabilidad, Nómina, Gastos" },
                  { label: "Fase 7 · Reportería / BI" },
                  { label: "Fase 8 · Asistentes IA + Automatizaciones" },
                ].map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <span
                      className={
                        "size-2 rounded-full " +
                        (s.done ? "bg-success" : "bg-border")
                      }
                    />
                    <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
                    {s.done && <span className="ml-auto text-xs text-success">Listo</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold">Acciones rápidas</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  { label: "Registrar producto", to: "/app/productos", icon: Package },
                  { label: "Crear bodega", to: "/app/bodegas", icon: Warehouse },
                  { label: "Nuevo tercero", to: "/app/terceros", icon: Users },
                  { label: "Ver empresas", to: "/app/empresas", icon: Building2 },
                ].map((a) => (
                  <li key={a.label}>
                    <a href={a.to} className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-accent transition">
                      <a.icon className="size-4 text-muted-foreground" />
                      <span className="flex-1">{a.label}</span>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8">
            <ComingSoon
              title="Reportería gerencial e IA"
              description="En próximas fases verás aquí KPIs, gráficos, alertas y recomendaciones generadas por el asistente inteligente."
            />
          </div>
        </>
      ) : (
        <div className="mt-8">
          <ComingSoon
            title="Aún no tienes empresas configuradas"
            description="Comienza creando tu primera empresa desde el módulo de Empresas."
          />
        </div>
      )}
    </div>
  );
}
