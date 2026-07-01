import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  DollarSign, ShoppingBag, TrendingUp, Package, Wallet, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Receipt,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader, StatCard, EmptyState } from "@/components/erp/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/reportes")({
  component: ReportesPage,
});

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(d: number) {
  const x = new Date(); x.setDate(x.getDate() - d);
  return x.toISOString().slice(0, 10);
}

function ReportesPage() {
  const { activeCompanyId } = useActiveCompany();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());

  const params = useMemo(() => ({ _company_id: activeCompanyId!, _from: from, _to: to }), [activeCompanyId, from, to]);

  const sales = useQuery({
    queryKey: ["rep-sales", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_sales_summary", params)).data?.[0] ?? null,
  });
  const pnl = useQuery({
    queryKey: ["rep-pnl", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_pnl", params)).data?.[0] ?? null,
  });
  const salesByDay = useQuery({
    queryKey: ["rep-sbd", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_sales_by_day", params)).data ?? [],
  });
  const topProducts = useQuery({
    queryKey: ["rep-top-prod", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_top_products", { ...params, _limit: 10 })).data ?? [],
  });
  const topCustomers = useQuery({
    queryKey: ["rep-top-cust", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_top_customers", { ...params, _limit: 10 })).data ?? [],
  });
  const purchases = useQuery({
    queryKey: ["rep-purch", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_purchases_summary", params)).data?.[0] ?? null,
  });
  const invValue = useQuery({
    queryKey: ["rep-inv-val", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_inventory_value", { _company_id: activeCompanyId! })).data ?? [],
  });
  const lowStock = useQuery({
    queryKey: ["rep-low", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_low_stock", { _company_id: activeCompanyId!, _limit: 50 })).data ?? [],
  });
  const cashflow = useQuery({
    queryKey: ["rep-cf", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_cashflow_by_day", params)).data ?? [],
  });
  const arAging = useQuery({
    queryKey: ["rep-ar", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_ar_aging", { _company_id: activeCompanyId! })).data ?? [],
  });
  const apAging = useQuery({
    queryKey: ["rep-ap", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_ap_aging", { _company_id: activeCompanyId! })).data ?? [],
  });
  const expenses = useQuery({
    queryKey: ["rep-exp", params],
    enabled: !!activeCompanyId,
    queryFn: async () => (await supabase.rpc("report_expenses_by_category", params)).data ?? [],
  });

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Analítica" title="Reportes / BI" />
        <EmptyState icon={TrendingUp} title="Selecciona una empresa" description="Elige una empresa activa para ver sus indicadores." />
      </div>
    );
  }

  const marginPct = sales.data && Number(sales.data.total_sales) > 0
    ? ((Number(sales.data.gross_margin) / Number(sales.data.total_sales)) * 100).toFixed(1) + "%"
    : "—";

  return (
    <div>
      <PageHeader
        eyebrow="Analítica"
        title="Reportes / BI"
        description="Indicadores gerenciales, ventas, cartera, inventario, tesorería y estado de resultados."
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventas del periodo" value={fmt(sales.data?.total_sales)} icon={DollarSign} hint={`${sales.data?.total_orders ?? 0} tickets`} />
        <StatCard label="Margen bruto" value={fmt(sales.data?.gross_margin)} icon={TrendingUp} hint={`Margen ${marginPct}`} />
        <StatCard label="Compras del periodo" value={fmt(purchases.data?.total_purchases)} icon={ShoppingBag} hint={`${purchases.data?.total_orders ?? 0} órdenes`} />
        <StatCard label="Utilidad neta (P&G)" value={fmt(pnl.data?.net_profit)} icon={Wallet} hint={`Gastos: ${fmt(pnl.data?.expenses)}`} />
      </div>

      <Tabs defaultValue="ventas" className="mt-8">
        <TabsList>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          <TabsTrigger value="cartera">Cartera</TabsTrigger>
          <TabsTrigger value="tesoreria">Tesorería</TabsTrigger>
          <TabsTrigger value="pyg">Estado de resultados</TabsTrigger>
        </TabsList>

        {/* ---------------- VENTAS ---------------- */}
        <TabsContent value="ventas" className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-4">Ventas por día</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={salesByDay.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Ventas" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4">Top productos (por ingreso)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Ingreso</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topProducts.data ?? []).map((p: any) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{p.name}</TableCell>
                      <TableCell className="text-right">{fmtNum(p.qty)}</TableCell>
                      <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                      <TableCell className="text-right text-success">{fmt(p.margin)}</TableCell>
                    </TableRow>
                  ))}
                  {(topProducts.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin datos en el periodo</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4">Top clientes</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="text-right">Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topCustomers.data ?? []).map((c: any) => (
                    <TableRow key={c.customer_id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right">{c.orders}</TableCell>
                      <TableCell className="text-right">{fmt(c.revenue)}</TableCell>
                    </TableRow>
                  ))}
                  {(topCustomers.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos en el periodo</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- INVENTARIO ---------------- */}
        <TabsContent value="inventario" className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-4">Valor de inventario por bodega</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={invValue.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="warehouse_name" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="total_value" fill="hsl(var(--primary))" name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bodega</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invValue.data ?? []).map((w: any) => (
                    <TableRow key={w.warehouse_id}>
                      <TableCell>{w.warehouse_name}</TableCell>
                      <TableCell className="text-right">{w.sku_count}</TableCell>
                      <TableCell className="text-right">{fmtNum(w.total_qty)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(w.total_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="size-4 text-warning" />
              <h3 className="font-semibold">Alertas de stock bajo</h3>
              <Badge variant="secondary" className="ml-2">{lowStock.data?.length ?? 0}</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Faltante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lowStock.data ?? []).map((p: any) => (
                  <TableRow key={p.product_id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.min_stock)}</TableCell>
                    <TableCell className="text-right">{fmtNum(p.current_qty)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">
                      {fmtNum(Number(p.min_stock) - Number(p.current_qty))}
                    </TableCell>
                  </TableRow>
                ))}
                {(lowStock.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin alertas de stock</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------------- CARTERA ---------------- */}
        <TabsContent value="cartera" className="mt-6 grid gap-6 lg:grid-cols-2">
          <AgingCard title="Cuentas por cobrar (CxC)" data={arAging.data ?? []} tone="success" />
          <AgingCard title="Cuentas por pagar (CxP)" data={apAging.data ?? []} tone="destructive" />
        </TabsContent>

        {/* ---------------- TESORERÍA ---------------- */}
        <TabsContent value="tesoreria" className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-4">Flujo de caja diario</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={cashflow.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="inflow" fill="hsl(var(--success))" name="Entradas" />
                  <Bar dataKey="outflow" fill="hsl(var(--destructive))" name="Salidas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Total entradas"
                value={fmt((cashflow.data ?? []).reduce((a: number, r: any) => a + Number(r.inflow), 0))}
                icon={ArrowUpRight}
              />
              <StatCard
                label="Total salidas"
                value={fmt((cashflow.data ?? []).reduce((a: number, r: any) => a + Number(r.outflow), 0))}
                icon={ArrowDownRight}
              />
              <StatCard
                label="Neto"
                value={fmt((cashflow.data ?? []).reduce((a: number, r: any) => a + Number(r.net), 0))}
                icon={Wallet}
              />
            </div>
          </div>
        </TabsContent>

        {/* ---------------- P&G ---------------- */}
        <TabsContent value="pyg" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4">Estado de resultados</h3>
              <div className="space-y-2 text-sm">
                <PnlRow label="Ingresos" value={pnl.data?.revenue} />
                <PnlRow label="(-) Costo de ventas" value={pnl.data?.cogs} negative />
                <PnlRow label="Utilidad bruta" value={pnl.data?.gross_profit} bold />
                <PnlRow label="(-) Gastos operacionales" value={pnl.data?.expenses} negative />
                <div className="border-t border-border pt-2 mt-2" />
                <PnlRow label="Utilidad neta" value={pnl.data?.net_profit} bold highlight />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="size-4 text-muted-foreground" />
                <h3 className="font-semibold">Gastos por categoría</h3>
              </div>
              {(expenses.data ?? []).length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={expenses.data}
                        dataKey="total"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e: any) => e.category}
                      >
                        {(expenses.data ?? []).map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={Package} title="Sin gastos en el periodo" />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PnlRow({
  label, value, negative, bold, highlight,
}: { label: string; value: any; negative?: boolean; bold?: boolean; highlight?: boolean }) {
  const n = Number(value ?? 0);
  return (
    <div className={`flex justify-between items-center ${bold ? "font-semibold" : ""}`}>
      <span className={highlight ? "text-base" : ""}>{label}</span>
      <span className={`font-mono ${highlight ? "text-base " + (n >= 0 ? "text-success" : "text-destructive") : ""}`}>
        {negative ? `(${fmt(n)})` : fmt(n)}
      </span>
    </div>
  );
}

function AgingCard({ title, data, tone }: { title: string; data: any[]; tone: "success" | "destructive" }) {
  const total = data.reduce((a, r) => a + Number(r.total), 0);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        <span className={`text-lg font-semibold ${tone === "success" ? "text-success" : "text-destructive"}`}>
          {fmt(total)}
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
            <YAxis type="category" dataKey="bucket" fontSize={11} width={80} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="total" fill={tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rango</TableHead>
            <TableHead className="text-right">Docs</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r: any) => (
            <TableRow key={r.bucket}>
              <TableCell>{r.bucket}</TableCell>
              <TableCell className="text-right">{r.doc_count}</TableCell>
              <TableCell className="text-right font-medium">{fmt(r.total)}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sin saldos pendientes</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
