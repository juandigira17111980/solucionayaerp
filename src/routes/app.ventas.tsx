import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Trash2, CheckCircle2, ShoppingBag, Receipt, Search, FileText,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/ventas")({ component: VentasPage });

const sb = supabase as any;
const fmt = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

const SO_BADGE: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  confirmada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};
const AR_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  parcial: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  cobrada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function VentasPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Ventas" title="Ventas" description="Facturas, cuentas por cobrar y punto de venta." />
        <EmptyState icon={ShoppingBag} title="Sin empresa activa" description="Selecciona o crea una empresa para operar ventas." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Ventas"
        description={`Facturas y CxC — ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? ""}`}
      />
      <Tabs defaultValue="ventas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ventas"><FileText className="size-4 mr-2" /> Facturas</TabsTrigger>
          <TabsTrigger value="cxc"><Receipt className="size-4 mr-2" /> Cuentas por Cobrar</TabsTrigger>
        </TabsList>
        <TabsContent value="ventas"><VentasTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="cxc"><CxCTab companyId={activeCompanyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function VentasTab({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const qc = useQueryClient();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales-orders", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("sales_orders")
        .select("*, customer:third_parties(legal_name, trade_name, tax_id), warehouse:warehouses(name)")
        .eq("company_id", companyId)
        .order("order_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const confirmSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("confirm_sales_order", { _sales_order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable", companyId] });
      toast.success("Venta confirmada. Se generó salida de inventario.");
    },
    onError: (e: any) => toast.error(e.message ?? "Error al confirmar"),
  });

  const filtered = useMemo(() => {
    if (!sales) return [];
    const q = search.toLowerCase();
    return sales.filter((s: any) =>
      !q || s.doc_number.toLowerCase().includes(q) ||
      s.customer?.legal_name?.toLowerCase().includes(q) ||
      s.customer?.trade_name?.toLowerCase().includes(q)
    );
  }, [sales, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar venta o cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4 mr-1" /> Nueva venta</Button>
          </DialogTrigger>
          <NewSaleDialog companyId={companyId} onClose={() => setOpenNew(false)} />
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8}>
                <EmptyState icon={ShoppingBag} title="Sin ventas" description="Crea tu primera venta o usa el punto de venta." />
              </TableCell></TableRow>
            ) : filtered.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">{s.doc_number}</TableCell>
                <TableCell>{s.order_date}</TableCell>
                <TableCell>
                  <div className="text-sm">{s.customer?.trade_name ?? s.customer?.legal_name ?? "Consumidor final"}</div>
                  {s.customer?.tax_id && <div className="text-xs text-muted-foreground">NIT {s.customer.tax_id}</div>}
                </TableCell>
                <TableCell className="text-sm">{s.warehouse?.name}</TableCell>
                <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">{s.payment_method}</TableCell>
                <TableCell className="text-right font-medium">$ {fmt(s.total)}</TableCell>
                <TableCell><Badge variant="secondary" className={SO_BADGE[s.status] ?? ""}>{s.status}</Badge></TableCell>
                <TableCell>
                  {s.status === "borrador" && (
                    <Button size="sm" variant="outline" disabled={confirmSale.isPending} onClick={() => confirmSale.mutate(s.id)}>
                      <CheckCircle2 className="size-4 mr-1" /> Confirmar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type SaleLine = { product_id: string; quantity: number; unit_price: number; tax_percent: number; discount_percent: number };

function NewSaleDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([
    { product_id: "", quantity: 1, unit_price: 0, tax_percent: 0, discount_percent: 0 },
  ]);

  const { data: customers } = useQuery({
    queryKey: ["customers-sale", companyId],
    queryFn: async () => {
      const { data } = await sb.from("third_parties").select("id, legal_name, trade_name, tax_id")
        .eq("company_id", companyId).in("kind", ["cliente", "ambos"]).order("legal_name");
      return data ?? [];
    },
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-sale", companyId],
    queryFn: async () => {
      const { data } = await sb.from("warehouses").select("id, name").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });
  const { data: products } = useQuery({
    queryKey: ["products-sale", companyId],
    queryFn: async () => {
      const { data } = await sb.from("products").select("id, sku, name, sale_price").eq("company_id", companyId).order("name").limit(500);
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    let sub = 0, tax = 0, disc = 0;
    for (const l of lines) {
      const s = l.quantity * l.unit_price;
      sub += s;
      tax += s * (l.tax_percent / 100);
      disc += s * (l.discount_percent / 100);
    }
    return { sub, tax, disc, total: sub + tax - disc };
  }, [lines]);

  function selectProduct(i: number, productId: string) {
    const p = products?.find((x: any) => x.id === productId);
    setLines((ls) => ls.map((x, j) => j === i ? { ...x, product_id: productId, unit_price: p?.sale_price ?? x.unit_price } : x));
  }

  const save = useMutation({
    mutationFn: async ({ confirm }: { confirm: boolean }) => {
      if (!warehouseId) throw new Error("Selecciona la bodega");
      if (paymentMethod === "credito" && !customerId) throw new Error("Ventas a crédito requieren cliente");
      if (lines.some((l) => !l.product_id || l.quantity <= 0)) throw new Error("Completa las líneas");
      const { data: docNum } = await sb.rpc("next_sales_number", { _company_id: companyId, _kind: "sale" });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: so, error: e1 } = await sb.from("sales_orders").insert({
        company_id: companyId, doc_number: docNum,
        customer_id: customerId || null, warehouse_id: warehouseId,
        channel: "venta", order_date: orderDate, due_date: dueDate || null,
        subtotal: totals.sub, tax_amount: totals.tax, discount_amount: totals.disc, total: totals.total,
        payment_method: paymentMethod, status: "borrador",
        notes: notes || null, created_by: user?.id,
      }).select("id").single();
      if (e1) throw e1;
      const payload = lines.map((l) => ({
        sales_order_id: so.id, product_id: l.product_id, quantity: l.quantity,
        unit_price: l.unit_price, tax_percent: l.tax_percent, discount_percent: l.discount_percent,
        subtotal: l.quantity * l.unit_price,
      }));
      const { error: e2 } = await sb.from("sales_order_lines").insert(payload);
      if (e2) throw e2;
      if (confirm) {
        const { error: e3 } = await sb.rpc("confirm_sales_order", { _sales_order_id: so.id });
        if (e3) throw e3;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable", companyId] });
      toast.success("Venta guardada");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader><DialogTitle>Nueva venta</DialogTitle></DialogHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Cliente</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Consumidor final…" /></SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.trade_name ?? c.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bodega *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="mixto">Mixto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
          {paymentMethod === "credito" && (
            <div>
              <Label>Vencimiento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Desc %</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select value={l.product_id} onValueChange={(v) => selectProduct(i, v)}>
                      <SelectTrigger><SelectValue placeholder="Producto…" /></SelectTrigger>
                      <SelectContent>
                        {(products ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.tax_percent} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, tax_percent: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.discount_percent} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, discount_percent: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell className="text-right font-medium">$ {fmt(l.quantity * l.unit_price)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { product_id: "", quantity: 1, unit_price: 0, tax_percent: 0, discount_percent: 0 }])}>
              <Plus className="size-4 mr-1" /> Agregar línea
            </Button>
            <div className="text-sm space-y-1 text-right">
              <div>Subtotal: <strong>$ {fmt(totals.sub)}</strong></div>
              <div>IVA: <strong>$ {fmt(totals.tax)}</strong></div>
              <div>Descuento: <strong>$ {fmt(totals.disc)}</strong></div>
              <div className="text-base">Total: <strong>$ {fmt(totals.total)}</strong></div>
            </div>
          </div>
        </div>

        <div>
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ confirm: false })}>Guardar borrador</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate({ confirm: true })}>
          <CheckCircle2 className="size-4 mr-1" /> Confirmar venta
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// CxC
// ============================================================
function CxCTab({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const { data: ars, isLoading } = useQuery({
    queryKey: ["accounts-receivable", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("accounts_receivable")
        .select("*, customer:third_parties(legal_name, trade_name, tax_id)")
        .eq("company_id", companyId).order("invoice_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!ars) return [];
    const q = search.toLowerCase();
    return ars.filter((a: any) =>
      !q || a.doc_number.toLowerCase().includes(q) ||
      a.customer?.legal_name?.toLowerCase().includes(q)
    );
  }, [ars, search]);

  const totalPending = useMemo(() =>
    (ars ?? []).filter((a: any) => a.status !== "cobrada" && a.status !== "anulada")
      .reduce((s: number, a: any) => s + Number(a.balance), 0), [ars]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Saldo total por cobrar</p>
          <p className="mt-2 text-2xl font-semibold">$ {fmt(totalPending)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Facturas</p>
          <p className="mt-2 text-2xl font-semibold">{ars?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Pendientes</p>
          <p className="mt-2 text-2xl font-semibold">{(ars ?? []).filter((a: any) => a.status === "pendiente" || a.status === "parcial").length}</p>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="Buscar CxC o cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CxC</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>F. Factura</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cobrado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8}>
                <EmptyState icon={Receipt} title="Sin cuentas por cobrar" description="Se generan automáticamente en ventas a crédito." />
              </TableCell></TableRow>
            ) : filtered.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm">{a.doc_number}</TableCell>
                <TableCell className="text-sm">
                  <div>{a.customer?.trade_name ?? a.customer?.legal_name}</div>
                  <div className="text-xs text-muted-foreground">NIT {a.customer?.tax_id}</div>
                </TableCell>
                <TableCell>{a.invoice_date}</TableCell>
                <TableCell>{a.due_date ?? "—"}</TableCell>
                <TableCell className="text-right">$ {fmt(a.total_amount)}</TableCell>
                <TableCell className="text-right">$ {fmt(a.paid_amount)}</TableCell>
                <TableCell className="text-right font-semibold">$ {fmt(a.balance)}</TableCell>
                <TableCell><Badge variant="secondary" className={AR_BADGE[a.status] ?? ""}>{a.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">Los cobros se habilitarán en la Fase 5 (Tesorería).</p>
    </div>
  );
}
