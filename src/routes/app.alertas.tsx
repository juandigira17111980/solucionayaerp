import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, PackageSearch, ShieldAlert, RefreshCw } from "lucide-react";

import { PageHeader, EmptyState, StatCard } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/alertas")({ component: AlertasPage });

type Alert = {
  severity: string;
  category: string;
  title: string;
  detail: string;
  reference_id: string | null;
  amount: number | null;
};

type Reorder = {
  product_id: string;
  sku: string;
  name: string;
  total_stock: number;
  min_stock: number;
  avg_daily_sales: number;
  days_of_stock: number | null;
  suggested_qty: number;
  reason: string;
};

const currency = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(Number(n ?? 0));

function AlertasPage() {
  const { activeCompanyId, isLoading } = useActiveCompany();

  const alertsQ = useQuery({
    queryKey: ["smart-alerts", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_smart_alerts", {
        p_company_id: activeCompanyId!,
      });
      if (error) throw error;
      return (data ?? []) as Alert[];
    },
  });

  const reorderQ = useQuery({
    queryKey: ["reorder", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_reorder_suggestions", {
        p_company_id: activeCompanyId!,
        p_days: 30,
      });
      if (error) throw error;
      return (data ?? []) as Reorder[];
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!activeCompanyId) {
    return (
      <EmptyState
        icon={Bell}
        title="Sin empresa activa"
        description="Selecciona una empresa para ver alertas y sugerencias."
      />
    );
  }

  const alerts = alertsQ.data ?? [];
  const high = alerts.filter((a) => a.severity === "high");
  const byCat = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.category] = (acc[a.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        eyebrow="Automatizaciones"
        title="Alertas inteligentes"
        description="Detección automática de riesgos financieros, cartera vencida y stock crítico, más sugerencias de reposición."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => { alertsQ.refetch(); reorderQ.refetch(); }}
          >
            <RefreshCw className="mr-2 size-4" /> Refrescar
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Alertas críticas" value={high.length} icon={ShieldAlert} />
        <StatCard label="CxC vencidas" value={byCat["CxC"] ?? 0} icon={AlertTriangle} />
        <StatCard label="CxP próximas" value={byCat["CxP"] ?? 0} icon={AlertTriangle} />
        <StatCard label="Stock crítico" value={byCat["Inventario"] ?? 0} icon={PackageSearch} />
      </div>

      <Tabs defaultValue="alertas">
        <TabsList>
          <TabsTrigger value="alertas">Alertas ({alerts.length})</TabsTrigger>
          <TabsTrigger value="reposicion">Sugerencias de reposición ({reorderQ.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="alertas" className="mt-4">
          {alerts.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Sin alertas"
              description="Tu operación está al día. Volveremos a revisar en cada carga."
            />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Alerta</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((a, i) => (
                    <TableRow key={`${a.reference_id ?? i}-${a.title}`}>
                      <TableCell>
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            (a.severity === "high"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
                          }
                        >
                          {a.severity === "high" ? "Alta" : "Media"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.category}</TableCell>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.detail}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.amount != null ? currency(a.amount) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reposicion" className="mt-4">
          {(reorderQ.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Sin sugerencias"
              description="No hay productos por reponer según el ritmo de ventas de los últimos 30 días."
            />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Vta/día</TableHead>
                    <TableHead className="text-right">Días stock</TableHead>
                    <TableHead className="text-right">Sugerido</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderQ.data!.map((r) => (
                    <TableRow key={r.product_id}>
                      <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.total_stock).toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(r.min_stock).toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(r.avg_daily_sales ?? 0).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.days_of_stock == null ? "—" : Number(r.days_of_stock).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {Math.ceil(Number(r.suggested_qty)).toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] " +
                            (r.reason === "Sin existencia"
                              ? "bg-destructive/10 text-destructive"
                              : r.reason === "Bajo stock mínimo"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-accent text-accent-foreground")
                          }
                        >
                          {r.reason}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
