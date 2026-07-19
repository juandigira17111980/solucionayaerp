import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Minus, Trash2, ScanLine, ShoppingCart, Lock, Unlock,
  Search, Receipt, FileText, Printer,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/app/pos")({ component: PosPage });

const sb = supabase as any;
const fmt = (n: number | string | null | undefined, d = 0) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

type CartItem = {
  product_id: string;
  sku: string;
  barcode: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  tracks_inventory: boolean;
  available_qty: number | null;
};
type PosProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  sale_price: number | string | null;
  product_type?: "physical" | "service" | "consumable";
  tracks_inventory: boolean;
  available_qty?: number | null;
};
type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "credito";
type PaymentLine = { payment_method: PaymentMethod; amount: number; reference: string };
type LastSale = { id: string; total: number; payments: PaymentLine[]; items: CartItem[] };

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Credito",
};

const PAYMENT_OPTIONS: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia", "credito"];

function PosPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const qc = useQueryClient();

  // Load active session for current user in this company
  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["pos-session-open", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await sb.from("pos_sessions")
        .select("*, warehouse:warehouses(name)")
        .eq("company_id", activeCompanyId!).eq("cashier_id", user!.id).eq("status", "abierta")
        .maybeSingle();
      return data ?? null;
    },
  });

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="POS" title="Punto de venta" />
        <EmptyState icon={ShoppingCart} title="Sin empresa activa" description="Selecciona o crea una empresa para operar el POS." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="POS"
        title="Punto de venta"
        description={`Terminal de caja — ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? ""}`}
        actions={session ? (
          <CloseSessionButton session={session} onClosed={() => { refetchSession(); qc.invalidateQueries({ queryKey: ["sales-orders", activeCompanyId] }); }} />
        ) : undefined}
      />

      <Tabs defaultValue="terminal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal"><ShoppingCart className="size-4 mr-2" /> Terminal</TabsTrigger>
          <TabsTrigger value="turnos"><FileText className="size-4 mr-2" /> Turnos</TabsTrigger>
        </TabsList>
        <TabsContent value="terminal">
          {!session ? (
            <OpenSessionCard companyId={activeCompanyId} onOpened={() => refetchSession()} />
          ) : (
            <PosTerminal companyId={activeCompanyId} session={session} onSold={() => { refetchSession(); qc.invalidateQueries({ queryKey: ["sales-orders", activeCompanyId] }); }} />
          )}
        </TabsContent>
        <TabsContent value="turnos">
          <PosSessionsHistory companyId={activeCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OpenSessionCard({ companyId, onOpened }: { companyId: string; onOpened: () => void }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [opening, setOpening] = useState(0);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-pos", companyId],
    queryFn: async () => {
      const { data } = await sb.from("warehouses").select("id, name").eq("company_id", companyId).order("name");
      return data ?? [];
    },
  });

  const open = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Selecciona la bodega/tienda");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: doc } = await sb.rpc("next_sales_number", { _company_id: companyId, _kind: "pos" });
      const { error } = await sb.from("pos_sessions").insert({
        company_id: companyId, doc_number: doc, cashier_id: user!.id,
        warehouse_id: warehouseId, opening_amount: opening, status: "abierta",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Turno abierto"); onOpened(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <div className="max-w-lg mx-auto rounded-xl border border-border bg-card p-6 shadow-elevation-low">
      <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground mx-auto">
        <Unlock className="size-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-center">Abrir turno de caja</h3>
      <p className="mt-1 text-sm text-muted-foreground text-center">Registra el monto inicial en efectivo para comenzar a vender.</p>

      <div className="mt-5 space-y-3">
        <div>
          <Label>Bodega / tienda *</Label>
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
          <Label>Monto inicial en efectivo</Label>
          <Input type="number" min={0} step="1" value={opening} onChange={(e) => setOpening(Number(e.target.value))} />
        </div>
        <Button className="w-full" disabled={open.isPending} onClick={() => open.mutate()}>
          <Unlock className="size-4 mr-2" /> Abrir turno
        </Button>
      </div>
    </div>
  );
}

function CloseSessionButton({ session, onClosed }: { session: any; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const { data: summary = [], refetch } = useQuery({
    queryKey: ["pos-session-summary", session.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.rpc("report_pos_session_summary", { _session_id: session.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalExpected = (summary ?? []).reduce((sum: number, row: any) => sum + Number(row.expected_amount ?? 0), 0);
  const totalCounted = (summary ?? []).reduce((sum: number, row: any) => sum + Number(counts[row.payment_method] ?? row.counted_amount ?? 0), 0);

  const close = useMutation({
    mutationFn: async () => {
      const payload = PAYMENT_OPTIONS.map((method) => ({
        payment_method: method,
        counted_amount: Number(counts[method] ?? 0),
      }));
      const { error } = await sb.rpc("close_pos_session", {
        _session_id: session.id,
        _counts: payload,
        _notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Turno cerrado"); setOpen(false); onClosed(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => refetch()}><Lock className="size-4 mr-2" /> Cerrar turno</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Cierre de turno {session.doc_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary ?? []).map((row: any) => {
                  const counted = Number(counts[row.payment_method] ?? row.counted_amount ?? 0);
                  const diff = counted - Number(row.expected_amount ?? 0);
                  return (
                    <TableRow key={row.payment_method}>
                      <TableCell>{PAYMENT_LABEL[row.payment_method as PaymentMethod] ?? row.payment_method}</TableCell>
                      <TableCell className="text-right">$ {fmt(row.expected_amount)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          value={counted}
                          onChange={(e) => setCounts((c) => ({ ...c, [row.payment_method]: Number(e.target.value) }))}
                          className="ml-auto h-8 w-32 text-right"
                        />
                      </TableCell>
                      <TableCell className={diff < 0 ? "text-right text-destructive" : "text-right text-emerald-600"}>$ {fmt(diff)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Esperado</p>
              <p className="text-lg font-semibold">$ {fmt(totalExpected)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Contado</p>
              <p className="text-lg font-semibold">$ {fmt(totalCounted)}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs uppercase text-muted-foreground">Diferencia</p>
              <p className="text-lg font-semibold">$ {fmt(totalCounted - totalExpected)}</p>
            </div>
          </div>
          <div>
            <Label>Notas de cierre</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones, novedades o soportes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={close.isPending} onClick={() => close.mutate()}><Lock className="size-4 mr-2" /> Cerrar turno</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PosTerminal({ companyId, session, onSold }: { companyId: string; session: any; onSold: () => void }) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [payments, setPayments] = useState<PaymentLine[]>([{ payment_method: "efectivo", amount: 0, reference: "" }]);
  const [openPay, setOpenPay] = useState(false);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products-pos", companyId, search],
    queryFn: async () => {
      let q = sb.from("products")
        .select("id, sku, barcode, name, sale_price, product_type, tracks_inventory, is_sellable")
        .eq("company_id", companyId)
        .eq("is_sellable", true)
        .order("name")
        .limit(24);
      if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const productIds = useMemo(
    () => (products ?? []).filter((p: PosProduct) => p.tracks_inventory).map((p: PosProduct) => p.id),
    [products],
  );
  const productIdsKey = productIds.join(",");

  const { data: stockLevels = [] } = useQuery({
    queryKey: ["pos-stock-levels", companyId, session.warehouse_id, productIdsKey],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("stock")
        .select("product_id, quantity")
        .eq("company_id", companyId)
        .eq("warehouse_id", session.warehouse_id)
        .in("product_id", productIds);
      return data ?? [];
    },
  });

  const productsWithStock = useMemo(() => {
    const stockByProduct = new Map((stockLevels ?? []).map((s: any) => [s.product_id, Number(s.quantity ?? 0)]));
    return (products ?? []).map((p: PosProduct) => ({
      ...p,
      available_qty: p.tracks_inventory ? stockByProduct.get(p.id) ?? 0 : null,
    })) as PosProduct[];
  }, [products, stockLevels]);

  const cartProductIds = useMemo(
    () => cart.filter((l) => l.tracks_inventory).map((l) => l.product_id),
    [cart],
  );
  const cartProductIdsKey = cartProductIds.join(",");

  const { data: cartStockLevels = [] } = useQuery({
    queryKey: ["pos-cart-stock-levels", companyId, session.warehouse_id, cartProductIdsKey],
    enabled: cartProductIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("stock")
        .select("product_id, quantity")
        .eq("company_id", companyId)
        .eq("warehouse_id", session.warehouse_id)
        .in("product_id", cartProductIds);
      return data ?? [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-pos", companyId],
    queryFn: async () => {
      const { data } = await sb.from("third_parties").select("id, legal_name, trade_name")
        .eq("company_id", companyId).in("kind", ["cliente", "ambos"]).order("legal_name").limit(200);
      return data ?? [];
    },
  });

  const total = useMemo(() => cart.reduce((a, l) => a + l.quantity * l.unit_price, 0), [cart]);
  const cartStockByProduct = useMemo(
    () => new Map((cartStockLevels ?? []).map((s: any) => [s.product_id, Number(s.quantity ?? 0)])),
    [cartStockLevels],
  );
  const stockIssues = useMemo(() => cart.filter((l) => {
    if (!l.tracks_inventory) return false;
    const available = cartStockByProduct.get(l.product_id) ?? l.available_qty ?? 0;
    return l.quantity > available;
  }), [cart, cartStockByProduct]);

  function addProduct(p: PosProduct) {
    setCart((c) => {
      const idx = c.findIndex((x) => x.product_id === p.id);
      const available = p.tracks_inventory ? Number(p.available_qty ?? 0) : null;
      if (idx >= 0) {
        const current = c[idx];
        const nextQty = current.quantity + 1;
        if (current.tracks_inventory && available !== null && nextQty > available) {
          toast.error(`Stock insuficiente para ${current.sku}. Disponible: ${fmt(available, 2)}`);
          return c;
        }
        return c.map((x, i) => i === idx ? { ...x, quantity: nextQty, available_qty: available } : x);
      }
      if (p.tracks_inventory && available !== null && available < 1) {
        toast.error(`Sin stock disponible para ${p.sku} en esta bodega`);
        return c;
      }
      return [...c, {
        product_id: p.id,
        sku: p.sku,
        barcode: p.barcode ?? null,
        name: p.name,
        quantity: 1,
        unit_price: Number(p.sale_price ?? 0),
        tracks_inventory: p.tracks_inventory,
        available_qty: available,
      }];
    });
  }

  function updateQty(i: number, delta: number) {
    setCart((c) => c.map((x, j) => {
      if (j !== i) return x;
      const available = cartStockByProduct.get(x.product_id) ?? x.available_qty ?? 0;
      const nextQty = Math.max(0.01, x.quantity + delta);
      if (x.tracks_inventory && nextQty > available) {
        toast.error(`Stock insuficiente para ${x.sku}. Disponible: ${fmt(available, 2)}`);
        return x;
      }
      return { ...x, quantity: nextQty, available_qty: x.tracks_inventory ? available : null };
    }));
  }

  function setQty(i: number, quantity: number) {
    setCart((c) => c.map((x, j) => {
      if (j !== i) return x;
      const available = cartStockByProduct.get(x.product_id) ?? x.available_qty ?? 0;
      const nextQty = Math.max(0.01, quantity || 0.01);
      if (x.tracks_inventory && nextQty > available) {
        toast.error(`Stock insuficiente para ${x.sku}. Disponible: ${fmt(available, 2)}`);
        return { ...x, quantity: available > 0 ? available : x.quantity, available_qty: available };
      }
      return { ...x, quantity: nextQty, available_qty: x.tracks_inventory ? available : null };
    }));
  }

  function updatePrice(i: number, price: number) {
    setCart((c) => c.map((x, j) => j === i ? { ...x, unit_price: price } : x));
  }

  const cartPayload = useMemo(() => cart.map((l) => ({
    product_id: l.product_id,
    quantity: l.quantity,
    unit_price: l.unit_price,
  })), [cart]);
  const paymentTotal = useMemo(() => payments.reduce((sum, p) => sum + Number(p.amount || 0), 0), [payments]);
  const validPayments = useMemo(() => payments.filter((p) => Number(p.amount) > 0), [payments]);

  async function validateCart() {
    if (cart.length === 0) throw new Error("Carrito vacio");
    const { data, error } = await sb.rpc("validate_pos_stock", {
      _company_id: companyId,
      _warehouse_id: session.warehouse_id,
      _items: cartPayload,
    });
    if (error) throw error;
    const issues = (data ?? []).filter((row: any) => row.ok !== true);
    if (issues.length > 0) {
      const first = issues[0];
      throw new Error(`Stock insuficiente para ${first.sku}. Disponible: ${fmt(first.available_qty, 2)}, requerido: ${fmt(first.requested_qty, 2)}`);
    }
  }

  async function enrichAvailability(product: PosProduct): Promise<PosProduct> {
    if (!product.tracks_inventory) return { ...product, available_qty: null };
    const { data } = await sb.from("stock")
      .select("quantity")
      .eq("company_id", companyId)
      .eq("warehouse_id", session.warehouse_id)
      .eq("product_id", product.id)
      .maybeSingle();
    return { ...product, available_qty: Number(data?.quantity ?? 0) };
  }

  async function scanCode() {
    const code = search.trim();
    if (!code) return;

    const selectCols = "id, sku, barcode, name, sale_price, product_type, tracks_inventory, is_sellable";
    const barcodeResult = await sb.from("products")
      .select(selectCols)
      .eq("company_id", companyId)
      .eq("is_sellable", true)
      .eq("barcode", code)
      .limit(1)
      .maybeSingle();

    let product = barcodeResult.data as PosProduct | null;
    if (!product) {
      const skuResult = await sb.from("products")
        .select(selectCols)
        .eq("company_id", companyId)
        .eq("is_sellable", true)
        .eq("sku", code)
        .limit(1)
        .maybeSingle();
      product = skuResult.data as PosProduct | null;
    }

    if (!product) {
      toast.error(`No se encontro producto para ${code}`);
      return;
    }

    addProduct(await enrichAvailability(product));
    setSearch("");
  }

  async function openPaymentDialog() {
    try {
      await validateCart();
      setPayments((current) => {
        const totalPaid = current.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        if (totalPaid <= 0) return [{ payment_method: "efectivo", amount: total, reference: "" }];
        return current;
      });
      setOpenPay(true);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo validar stock");
    }
  }

  const sell = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrito vacio");
      await validateCart();
      if (validPayments.length === 0) throw new Error("Registra al menos un pago");
      if (Math.abs(paymentTotal - total) > 0.01) throw new Error("Los pagos deben coincidir con el total");
      if (validPayments.some((p) => p.payment_method === "credito") && !customerId) throw new Error("Credito requiere cliente");
      const { data, error } = await sb.rpc("process_pos_sale", {
        _session_id: session.id,
        _customer_id: customerId || null,
        _payments: validPayments,
        _items: cartPayload,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (saleId: string) => {
      toast.success("Venta procesada");
      setLastSale({ id: saleId, total, payments: validPayments, items: cart });
      setCart([]); setCustomerId(""); setPayments([{ payment_method: "efectivo", amount: 0, reference: "" }]); setOpenPay(false);
      qc.invalidateQueries({ queryKey: ["pos-stock-levels"] });
      qc.invalidateQueries({ queryKey: ["pos-cart-stock-levels"] });
      qc.invalidateQueries({ queryKey: ["pos-sessions-history"] });
      onSold();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
      {/* Product picker */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Turno {session.doc_number}
          </Badge>
          <span className="text-sm text-muted-foreground">Bodega: {session.warehouse?.name}</span>
        </div>
        <div
          className="relative"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              scanCode();
            }
          }}
        >
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input autoFocus placeholder="Buscar por SKU, nombre o código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {productsWithStock.map((p: PosProduct) => {
            const outOfStock = p.tracks_inventory && Number(p.available_qty ?? 0) <= 0;
            return (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              disabled={outOfStock}
              className="group text-left rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-elevation-low transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-muted-foreground truncate">{p.sku}</p>
                <Badge variant={p.tracks_inventory ? (outOfStock ? "destructive" : "secondary") : "outline"} className="shrink-0">
                  {p.tracks_inventory ? `Stock ${fmt(p.available_qty ?? 0, 2)}` : "Servicio"}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-medium line-clamp-2 min-h-[2.5em]">{p.name}</p>
              <p className="mt-2 text-base font-semibold text-primary">$ {fmt(p.sale_price)}</p>
            </button>
            );
          })}
          {productsWithStock.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={Search} title="Sin resultados" description="Escanea o busca un producto para agregarlo." />
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="rounded-xl border border-border bg-card flex flex-col max-h-[calc(100vh-14rem)]">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-4" /> Carrito ({cart.length})</div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCart([])}><Trash2 className="size-4 mr-1" /> Vaciar</Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {cart.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecciona productos para iniciar la venta.
            </div>
          )}
          {cart.map((l, i) => (
            <div key={l.product_id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-muted-foreground">{l.sku}</p>
                  <p className="text-sm font-medium truncate">{l.name}</p>
                  <p className={l.tracks_inventory && stockIssues.some((x) => x.product_id === l.product_id) ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {l.tracks_inventory ? `Disponible: ${fmt(cartStockByProduct.get(l.product_id) ?? l.available_qty ?? 0, 2)}` : "Servicio sin inventario"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="inline-flex items-center rounded-md border border-border">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => updateQty(i, -1)}><Minus className="size-3.5" /></Button>
                  <Input type="number" value={l.quantity} onChange={(e) => setQty(i, Number(e.target.value))} className="w-14 h-8 text-center border-0" />
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => updateQty(i, +1)}><Plus className="size-3.5" /></Button>
                </div>
                <Input type="number" value={l.unit_price} onChange={(e) => updatePrice(i, Number(e.target.value))} className="h-8 w-28 text-right" />
                <span className="text-sm font-semibold w-24 text-right">$ {fmt(l.quantity * l.unit_price)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-3 bg-surface">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold tracking-tight">$ {fmt(total)}</span>
          </div>
          {stockIssues.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Hay productos con stock insuficiente en esta bodega.
            </div>
          )}
          <Dialog open={openPay} onOpenChange={setOpenPay}>
            <Button className="w-full h-11 text-base" disabled={cart.length === 0 || stockIssues.length > 0} onClick={openPaymentDialog}>
              <Receipt className="size-4 mr-2" /> Cobrar
            </Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Cobrar $ {fmt(total)}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medio</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((line, index) => (
                        <TableRow key={`${line.payment_method}-${index}`}>
                          <TableCell>
                            <Select
                              value={line.payment_method}
                              onValueChange={(value) => setPayments((current) => current.map((p, i) => (
                                i === index ? { ...p, payment_method: value as PaymentMethod } : p
                              )))}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_OPTIONS.map((method) => (
                                  <SelectItem key={method} value={method}>{PAYMENT_LABEL[method]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              value={line.amount}
                              onChange={(e) => setPayments((current) => current.map((p, i) => (
                                i === index ? { ...p, amount: Number(e.target.value) } : p
                              )))}
                              className="h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={line.reference}
                              onChange={(e) => setPayments((current) => current.map((p, i) => (
                                i === index ? { ...p, reference: e.target.value } : p
                              )))}
                              placeholder="Voucher, banco o nota"
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={payments.length === 1}
                              onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPayments((current) => [
                      ...current,
                      { payment_method: "tarjeta", amount: Math.max(total - paymentTotal, 0), reference: "" },
                    ])}
                  >
                    <Plus className="size-4 mr-1" /> Agregar pago
                  </Button>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">Pagado: $ {fmt(paymentTotal)}</p>
                    <p className={Math.abs(paymentTotal - total) > 0.01 ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
                      Diferencia: $ {fmt(paymentTotal - total)}
                    </p>
                  </div>
                </div>
                {payments.some((line) => line.payment_method === "credito") && (
                  <div>
                    <Label>Cliente *</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                      <SelectContent>
                        {(customers ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.trade_name ?? c.legal_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenPay(false)}>Cancelar</Button>
                <Button disabled={sell.isPending || validPayments.length === 0 || Math.abs(paymentTotal - total) > 0.01} onClick={() => sell.mutate()}>
                  Confirmar cobro
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {lastSale && <LastSaleTicketDialog sale={lastSale} />}
        </div>
      </div>
    </div>
  );
}

function LastSaleTicketDialog({ sale }: { sale: LastSale }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Printer className="size-4 mr-2" /> Ver ultimo recibo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Recibo POS</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="border-b border-dashed border-border pb-2">
            <p className="font-mono text-xs text-muted-foreground">Venta {sale.id.slice(0, 8)}</p>
            <p className="font-semibold">Total $ {fmt(sale.total)}</p>
          </div>
          <div className="space-y-2">
            {sale.items.map((item) => (
              <div key={item.product_id} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(item.quantity, 2)} x $ {fmt(item.unit_price)}</p>
                </div>
                <p className="font-medium">$ {fmt(item.quantity * item.unit_price)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-border pt-2 space-y-1">
            {sale.payments.map((payment, index) => (
              <div key={`${payment.payment_method}-${index}`} className="flex justify-between">
                <span>{PAYMENT_LABEL[payment.payment_method]}</span>
                <span>$ {fmt(payment.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4 mr-2" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PosSessionsHistory({ companyId }: { companyId: string }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["pos-sessions-history", companyId],
    queryFn: async () => {
      const { data, error } = await sb.rpc("report_pos_sessions_history", { _company_id: companyId });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalsByWarehouse = useMemo(() => {
    const totals = new Map<string, { warehouse: string; sales: number; difference: number; sessions: number }>();
    for (const session of sessions as any[]) {
      const key = session.warehouse_id ?? "sin-bodega";
      const current = totals.get(key) ?? {
        warehouse: session.warehouse_name ?? session.warehouse?.name ?? "Sin bodega",
        sales: 0,
        difference: 0,
        sessions: 0,
      };
      current.sales += Number(session.sales_amount ?? 0);
      current.difference += Number(session.difference ?? 0);
      current.sessions += 1;
      totals.set(key, current);
    }
    return Array.from(totals.values());
  }, [sessions]);

  if (isLoading) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Cargando turnos...</div>;
  }

  if (sessions.length === 0) {
    return <EmptyState icon={FileText} title="Sin turnos POS" description="Cuando abras y cierres caja, el historial aparecera aqui." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {totalsByWarehouse.slice(0, 3).map((row) => (
          <div key={row.warehouse} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{row.warehouse}</p>
            <p className="mt-1 text-xl font-semibold">$ {fmt(row.sales)}</p>
            <p className={row.difference < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              Diferencia $ {fmt(row.difference)} en {row.sessions} turno(s)
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turno</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Contado</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions as any[]).map((session) => {
              const sales = Number(session.sales_amount ?? 0);
              return (
                <TableRow key={session.id}>
                  <TableCell>
                    <div className="font-medium">{session.doc_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(session.opened_at).toLocaleString("es-CO")}</div>
                  </TableCell>
                  <TableCell>{session.warehouse_name ?? session.warehouse?.name ?? "Sin bodega"}</TableCell>
                  <TableCell className="font-mono text-xs">{String(session.cashier_id ?? "").slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={session.status === "abierta" ? "secondary" : "outline"}>
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">$ {fmt(sales)}</TableCell>
                  <TableCell className="text-right">$ {fmt(session.counted_amount)}</TableCell>
                  <TableCell className={Number(session.difference ?? 0) < 0 ? "text-right text-destructive" : "text-right"}>
                    $ {fmt(session.difference)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PosSessionSummaryDialog session={session} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PosSessionSummaryDialog({ session }: { session: any }) {
  const [open, setOpen] = useState(false);
  const { data: summary = [] } = useQuery({
    queryKey: ["pos-session-summary-history", session.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.rpc("report_pos_session_summary", { _session_id: session.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Ver</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Reporte de caja {session.doc_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Bodega</p>
              <p className="font-medium">{session.warehouse_name ?? session.warehouse?.name ?? "Sin bodega"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Usuario</p>
              <p className="font-mono text-xs">{session.cashier_id}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medio</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary as any[]).map((row) => (
                  <TableRow key={row.payment_method}>
                    <TableCell>{PAYMENT_LABEL[row.payment_method as PaymentMethod] ?? row.payment_method}</TableCell>
                    <TableCell className="text-right">$ {fmt(row.expected_amount)}</TableCell>
                    <TableCell className="text-right">$ {fmt(row.counted_amount)}</TableCell>
                    <TableCell className={Number(row.difference ?? 0) < 0 ? "text-right text-destructive" : "text-right"}>
                      $ {fmt(row.difference)}
                    </TableCell>
                    <TableCell className="text-right">$ {fmt(row.sales_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {session.closing_notes && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="text-xs uppercase text-muted-foreground">Notas de cierre</p>
              <p>{session.closing_notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
