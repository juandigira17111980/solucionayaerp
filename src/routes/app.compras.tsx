import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Trash2, CheckCircle2, ShoppingCart, PackageCheck, Receipt,
  FileText, Search, Building2,
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

export const Route = createFileRoute("/app/compras")({ component: ComprasPage });

const fmt = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

const PO_BADGE: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  aprobada: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  recibida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};
const AP_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  parcial: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  pagada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  anulada: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

// helper — supabase typed client
const sb = supabase as any;

function ComprasPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Compras" title="Compras" description="Órdenes, recepciones y cuentas por pagar." />
        <EmptyState icon={ShoppingCart} title="Sin empresa activa" description="Selecciona o crea una empresa para operar compras." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Compras"
        description={`Órdenes, recepciones y CxP — ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? ""}`}
      />
      <Tabs defaultValue="ordenes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ordenes"><FileText className="size-4 mr-2" /> Órdenes</TabsTrigger>
          <TabsTrigger value="recepciones"><PackageCheck className="size-4 mr-2" /> Recepciones</TabsTrigger>
          <TabsTrigger value="cxp"><Receipt className="size-4 mr-2" /> Cuentas por Pagar</TabsTrigger>
        </TabsList>
        <TabsContent value="ordenes"><OrdenesTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="recepciones"><RecepcionesTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="cxp"><CxPTab companyId={activeCompanyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// ÓRDENES DE COMPRA
// ============================================================
function OrdenesTab({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("purchase_orders")
        .select("*, supplier:third_parties(legal_name, trade_name, tax_id), warehouse:warehouses(name)")
        .eq("company_id", companyId)
        .order("order_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.toLowerCase();
    return orders.filter((o: any) =>
      !q || o.doc_number.toLowerCase().includes(q) ||
      o.supplier?.legal_name?.toLowerCase().includes(q) ||
      o.supplier?.trade_name?.toLowerCase().includes(q)
    );
  }, [orders, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar orden o proveedor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4 mr-1" /> Nueva orden</Button>
          </DialogTrigger>
          <NewOrderDialog companyId={companyId} onClose={() => setOpenNew(false)} />
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6}>
                <EmptyState icon={ShoppingCart} title="Sin órdenes de compra" description="Crea tu primera orden para empezar." />
              </TableCell></TableRow>
            ) : filtered.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-sm">{o.doc_number}</TableCell>
                <TableCell>{o.order_date}</TableCell>
                <TableCell>
                  <div className="text-sm">{o.supplier?.trade_name ?? o.supplier?.legal_name}</div>
                  <div className="text-xs text-muted-foreground">NIT {o.supplier?.tax_id}</div>
                </TableCell>
                <TableCell className="text-sm">{o.warehouse?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">$ {fmt(o.total)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={PO_BADGE[o.status] ?? ""}>{o.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type OrderLine = { product_id: string; quantity: number; unit_cost: number; tax_percent: number; discount_percent: number };

function NewOrderDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([
    { product_id: "", quantity: 1, unit_cost: 0, tax_percent: 0, discount_percent: 0 },
  ]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-po", companyId],
    queryFn: async () => {
      const { data } = await sb.from("third_parties").select("id, legal_name, trade_name, tax_id")
        .eq("company_id", companyId).in("kind", ["proveedor", "ambos"]).order("legal_name");
      return data ?? [];
    },
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-po", companyId],
    queryFn: async () => {
      const { data } = await sb.from("warehouses").select("id, name").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });
  const { data: products } = useQuery({
    queryKey: ["products-po", companyId],
    queryFn: async () => {
      const { data } = await sb.from("products").select("id, sku, name").eq("company_id", companyId).order("name").limit(500);
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    let sub = 0, tax = 0, disc = 0;
    for (const l of lines) {
      const s = l.quantity * l.unit_cost;
      sub += s;
      tax += s * (l.tax_percent / 100);
      disc += s * (l.discount_percent / 100);
    }
    return { sub, tax, disc, total: sub + tax - disc };
  }, [lines]);

  const save = useMutation({
    mutationFn: async ({ approve }: { approve: boolean }) => {
      if (!supplierId) throw new Error("Selecciona el proveedor");
      if (lines.some((l) => !l.product_id || l.quantity <= 0)) throw new Error("Completa todas las líneas");
      const { data: docNum } = await sb.rpc("next_purchase_number", { _company_id: companyId, _kind: "order" });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: po, error: e1 } = await sb.from("purchase_orders").insert({
        company_id: companyId, doc_number: docNum, supplier_id: supplierId,
        warehouse_id: warehouseId || null,
        order_date: orderDate, expected_date: expectedDate || null,
        subtotal: totals.sub, tax_amount: totals.tax, discount_amount: totals.disc, total: totals.total,
        status: approve ? "aprobada" : "borrador",
        notes: notes || null, created_by: user?.id,
        approved_by: approve ? user?.id : null, approved_at: approve ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;
      const payload = lines.map((l) => ({
        purchase_order_id: po.id, product_id: l.product_id, quantity: l.quantity,
        unit_cost: l.unit_cost, tax_percent: l.tax_percent, discount_percent: l.discount_percent,
        subtotal: l.quantity * l.unit_cost,
      }));
      const { error: e2 } = await sb.from("purchase_order_lines").insert(payload);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
      toast.success("Orden creada");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear"),
  });

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>Nueva orden de compra</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Proveedor *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bodega destino</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div>
              <Label>Esperada</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
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
                    <Select value={l.product_id} onValueChange={(v) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, product_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Producto…" /></SelectTrigger>
                      <SelectContent>
                        {(products ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_cost: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.tax_percent} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, tax_percent: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.discount_percent} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, discount_percent: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell className="text-right font-medium">$ {fmt(l.quantity * l.unit_cost)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { product_id: "", quantity: 1, unit_cost: 0, tax_percent: 0, discount_percent: 0 }])}>
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
        <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ approve: false })}>Guardar borrador</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate({ approve: true })}>
          <CheckCircle2 className="size-4 mr-1" /> Aprobar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// RECEPCIONES
// ============================================================
function RecepcionesTab({ companyId }: { companyId: string }) {
  const [openNew, setOpenNew] = useState(false);
  const qc = useQueryClient();

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["purchase-receipts", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("purchase_receipts")
        .select("*, supplier:third_parties(legal_name, trade_name), warehouse:warehouses(name), order:purchase_orders(doc_number)")
        .eq("company_id", companyId)
        .order("receipt_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const confirmRec = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("confirm_purchase_receipt", { _receipt_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-receipts", companyId] });
      qc.invalidateQueries({ queryKey: ["purchase-orders", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-payable", companyId] });
      toast.success("Recepción confirmada. Se generó entrada de inventario y CxP.");
    },
    onError: (e: any) => toast.error(e.message ?? "Error al confirmar"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4 mr-1" /> Nueva recepción</Button>
          </DialogTrigger>
          <NewReceiptDialog companyId={companyId} onClose={() => setOpenNew(false)} />
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>OC</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : (receipts ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={8}>
                <EmptyState icon={PackageCheck} title="Sin recepciones" description="Registra la recepción de mercancía de tus proveedores." />
              </TableCell></TableRow>
            ) : (receipts ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.doc_number}</TableCell>
                <TableCell>{r.receipt_date}</TableCell>
                <TableCell className="text-sm">{r.supplier?.trade_name ?? r.supplier?.legal_name}</TableCell>
                <TableCell className="font-mono text-xs">{r.order?.doc_number ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.warehouse?.name}</TableCell>
                <TableCell className="text-right font-medium">$ {fmt(r.total)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={r.status === "confirmada" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.status === "borrador" && (
                    <Button size="sm" variant="outline" disabled={confirmRec.isPending} onClick={() => confirmRec.mutate(r.id)}>
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

type ReceiptLine = { purchase_order_line_id: string | null; product_id: string; quantity: number; unit_cost: number };

function NewReceiptDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [poId, setPoId] = useState<string>("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoice, setInvoice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);

  const { data: openOrders } = useQuery({
    queryKey: ["po-open", companyId],
    queryFn: async () => {
      const { data } = await sb.from("purchase_orders")
        .select("id, doc_number, supplier_id, warehouse_id, status, supplier:third_parties(legal_name, trade_name)")
        .eq("company_id", companyId).in("status", ["aprobada", "parcial"]).order("order_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-rec", companyId],
    queryFn: async () => {
      const { data } = await sb.from("third_parties").select("id, legal_name, trade_name")
        .eq("company_id", companyId).in("kind", ["proveedor", "ambos"]).order("legal_name");
      return data ?? [];
    },
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-rec", companyId],
    queryFn: async () => {
      const { data } = await sb.from("warehouses").select("id, name").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });
  const { data: products } = useQuery({
    queryKey: ["products-rec", companyId],
    queryFn: async () => {
      const { data } = await sb.from("products").select("id, sku, name").eq("company_id", companyId).order("name").limit(500);
      return data ?? [];
    },
  });

  // When selecting a PO, prefill supplier, warehouse and pending lines
  async function selectPO(id: string) {
    setPoId(id);
    if (!id) { setLines([]); return; }
    const { data: po } = await sb.from("purchase_orders").select("*").eq("id", id).single();
    if (po) {
      setSupplierId(po.supplier_id);
      if (po.warehouse_id) setWarehouseId(po.warehouse_id);
    }
    const { data: pol } = await sb.from("purchase_order_lines").select("*").eq("purchase_order_id", id);
    setLines((pol ?? [])
      .filter((l: any) => Number(l.quantity) - Number(l.received_quantity) > 0)
      .map((l: any) => ({
        purchase_order_line_id: l.id, product_id: l.product_id,
        quantity: Number(l.quantity) - Number(l.received_quantity),
        unit_cost: Number(l.unit_cost),
      })));
  }

  const total = useMemo(() => lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0), [lines]);

  const save = useMutation({
    mutationFn: async () => {
      if (!supplierId || !warehouseId) throw new Error("Selecciona proveedor y bodega");
      if (lines.length === 0 || lines.some((l) => !l.product_id || l.quantity <= 0)) throw new Error("Completa las líneas");
      const { data: docNum } = await sb.rpc("next_purchase_number", { _company_id: companyId, _kind: "receipt" });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: rec, error: e1 } = await sb.from("purchase_receipts").insert({
        company_id: companyId, doc_number: docNum, purchase_order_id: poId || null,
        supplier_id: supplierId, warehouse_id: warehouseId, receipt_date: receiptDate,
        supplier_invoice: invoice || null, invoice_date: invoiceDate || null, due_date: dueDate || null,
        total, notes: notes || null, status: "borrador", created_by: user?.id,
      }).select("id").single();
      if (e1) throw e1;
      const payload = lines.map((l) => ({
        receipt_id: rec.id, purchase_order_line_id: l.purchase_order_line_id,
        product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost,
        subtotal: l.quantity * l.unit_cost,
      }));
      const { error: e2 } = await sb.from("purchase_receipt_lines").insert(payload);
      if (e2) throw e2;
      return rec.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-receipts", companyId] });
      toast.success("Recepción creada en borrador. Confírmala para generar inventario y CxP.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader><DialogTitle>Nueva recepción de compra</DialogTitle></DialogHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Orden de compra (opcional)</Label>
            <Select value={poId} onValueChange={selectPO}>
              <SelectTrigger><SelectValue placeholder="Sin OC / directa…" /></SelectTrigger>
              <SelectContent>
                {(openOrders ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>{o.doc_number} — {o.supplier?.trade_name ?? o.supplier?.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha recepción</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
          <div>
            <Label>Proveedor *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bodega destino *</Label>
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
            <Label>Factura proveedor</Label>
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="FV-1234" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Fecha factura</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>Vencimiento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Agrega líneas o selecciona una OC.</TableCell></TableRow>
              )}
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select value={l.product_id} onValueChange={(v) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, product_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Producto…" /></SelectTrigger>
                      <SelectContent>
                        {(products ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_cost: Number(e.target.value) } : x))} className="text-right" /></TableCell>
                  <TableCell className="text-right font-medium">$ {fmt(l.quantity * l.unit_cost)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { purchase_order_line_id: null, product_id: "", quantity: 1, unit_cost: 0 }])}>
              <Plus className="size-4 mr-1" /> Agregar línea
            </Button>
            <div className="text-base">Total: <strong>$ {fmt(total)}</strong></div>
          </div>
        </div>

        <div>
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>Guardar borrador</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// CUENTAS POR PAGAR
// ============================================================
function CxPTab({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const { data: aps, isLoading } = useQuery({
    queryKey: ["accounts-payable", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("accounts_payable")
        .select("*, supplier:third_parties(legal_name, trade_name, tax_id)")
        .eq("company_id", companyId).order("invoice_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!aps) return [];
    const q = search.toLowerCase();
    return aps.filter((a: any) =>
      !q || a.doc_number.toLowerCase().includes(q) ||
      a.supplier_invoice?.toLowerCase().includes(q) ||
      a.supplier?.legal_name?.toLowerCase().includes(q)
    );
  }, [aps, search]);

  const totalPending = useMemo(() =>
    (aps ?? []).filter((a: any) => a.status !== "pagada" && a.status !== "anulada")
      .reduce((s: number, a: any) => s + Number(a.balance), 0), [aps]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Saldo total por pagar</p>
          <p className="mt-2 text-2xl font-semibold">$ {fmt(totalPending)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Facturas</p>
          <p className="mt-2 text-2xl font-semibold">{aps?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Pendientes</p>
          <p className="mt-2 text-2xl font-semibold">
            {(aps ?? []).filter((a: any) => a.status === "pendiente" || a.status === "parcial").length}
          </p>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="Buscar CxP, factura o proveedor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CxP</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>F. Factura</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9}>
                <EmptyState icon={Receipt} title="Sin cuentas por pagar" description="Se generan automáticamente al confirmar recepciones." />
              </TableCell></TableRow>
            ) : filtered.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-sm">{a.doc_number}</TableCell>
                <TableCell className="text-sm">{a.supplier_invoice ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  <div>{a.supplier?.trade_name ?? a.supplier?.legal_name}</div>
                  <div className="text-xs text-muted-foreground">NIT {a.supplier?.tax_id}</div>
                </TableCell>
                <TableCell>{a.invoice_date}</TableCell>
                <TableCell>{a.due_date ?? "—"}</TableCell>
                <TableCell className="text-right">$ {fmt(a.total_amount)}</TableCell>
                <TableCell className="text-right">$ {fmt(a.paid_amount)}</TableCell>
                <TableCell className="text-right font-semibold">$ {fmt(a.balance)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={AP_BADGE[a.status] ?? ""}>{a.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Building2 className="size-3" /> Los pagos completos se habilitarán en la Fase 5 (Tesorería).
      </p>
    </div>
  );
}
