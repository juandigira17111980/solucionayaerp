import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Minus, Trash2, ScanLine, ShoppingCart, Lock, Unlock,
  CreditCard, Banknote, ArrowRightLeft, Wallet, Search, Receipt,
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
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/pos")({ component: PosPage });

const sb = supabase as any;
const fmt = (n: number | string | null | undefined, d = 0) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

type CartItem = { product_id: string; sku: string; name: string; quantity: number; unit_price: number };
type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "credito";

function PosPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const qc = useQueryClient();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="POS" title="Punto de venta" />
        <EmptyState icon={ShoppingCart} title="Sin empresa activa" description="Selecciona o crea una empresa para operar el POS." />
      </div>
    );
  }

  // Load active session for current user in this company
  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["pos-session-open", activeCompanyId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await sb.from("pos_sessions")
        .select("*, warehouse:warehouses(name)")
        .eq("company_id", activeCompanyId).eq("cashier_id", user!.id).eq("status", "abierta")
        .maybeSingle();
      return data ?? null;
    },
  });

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

      {!session ? (
        <OpenSessionCard companyId={activeCompanyId} onOpened={() => refetchSession()} />
      ) : (
        <PosTerminal companyId={activeCompanyId} session={session} onSold={() => { refetchSession(); qc.invalidateQueries({ queryKey: ["sales-orders", activeCompanyId] }); }} />
      )}
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
  const expected = Number(session.opening_amount) + Number(session.expected_amount);
  const [counted, setCounted] = useState<number>(expected);

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("close_pos_session", { _session_id: session.id, _counted: counted });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Turno cerrado"); setOpen(false); onClosed(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Lock className="size-4 mr-2" /> Cerrar turno</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cierre de turno {session.doc_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Monto inicial</p>
              <p className="text-lg font-semibold">$ {fmt(session.opening_amount)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Ventas efectivo</p>
              <p className="text-lg font-semibold">$ {fmt(session.expected_amount)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase text-muted-foreground">Ventas totales</p>
              <p className="text-lg font-semibold">$ {fmt(session.total_sales)}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs uppercase text-muted-foreground">Esperado en caja</p>
              <p className="text-lg font-semibold">$ {fmt(expected)}</p>
            </div>
          </div>
          <div>
            <Label>Contado en caja *</Label>
            <Input type="number" min={0} step="1" value={counted} onChange={(e) => setCounted(Number(e.target.value))} />
            <p className="mt-1 text-sm">Diferencia: <strong className={counted - expected < 0 ? "text-destructive" : "text-emerald-600"}>$ {fmt(counted - expected)}</strong></p>
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
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [openPay, setOpenPay] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products-pos", companyId, search],
    queryFn: async () => {
      let q = sb.from("products").select("id, sku, name, sale_price").eq("company_id", companyId).order("name").limit(24);
      if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
      const { data } = await q;
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

  function addProduct(p: any) {
    setCart((c) => {
      const idx = c.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) return c.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x);
      return [...c, { product_id: p.id, sku: p.sku, name: p.name, quantity: 1, unit_price: Number(p.sale_price ?? 0) }];
    });
  }

  function updateQty(i: number, delta: number) {
    setCart((c) => c.map((x, j) => j === i ? { ...x, quantity: Math.max(0.01, x.quantity + delta) } : x));
  }

  function updatePrice(i: number, price: number) {
    setCart((c) => c.map((x, j) => j === i ? { ...x, unit_price: price } : x));
  }

  const sell = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrito vacío");
      if (payment === "credito" && !customerId) throw new Error("Crédito requiere cliente");
      const { data: docNum } = await sb.rpc("next_sales_number", { _company_id: companyId, _kind: "sale" });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: so, error: e1 } = await sb.from("sales_orders").insert({
        company_id: companyId, doc_number: docNum,
        customer_id: customerId || null, warehouse_id: session.warehouse_id,
        pos_session_id: session.id, channel: "pos",
        order_date: new Date().toISOString().slice(0, 10),
        subtotal: total, tax_amount: 0, discount_amount: 0, total,
        payment_method: payment, status: "borrador", created_by: user?.id,
      }).select("id").single();
      if (e1) throw e1;
      const payload = cart.map((l) => ({
        sales_order_id: so.id, product_id: l.product_id, quantity: l.quantity,
        unit_price: l.unit_price, tax_percent: 0, discount_percent: 0,
        subtotal: l.quantity * l.unit_price,
      }));
      const { error: e2 } = await sb.from("sales_order_lines").insert(payload);
      if (e2) throw e2;
      const { error: e3 } = await sb.rpc("confirm_sales_order", { _sales_order_id: so.id });
      if (e3) throw e3;
    },
    onSuccess: () => {
      toast.success("Venta procesada");
      setCart([]); setCustomerId(""); setPayment("efectivo"); setOpenPay(false);
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
        <div className="relative">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input autoFocus placeholder="Buscar por SKU, nombre o código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {(products ?? []).map((p: any) => (
            <button
              key={p.id}
              onClick={() => addProduct(p)}
              className="group text-left rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-elevation-low transition"
            >
              <p className="text-xs font-mono text-muted-foreground">{p.sku}</p>
              <p className="mt-1 text-sm font-medium line-clamp-2 min-h-[2.5em]">{p.name}</p>
              <p className="mt-2 text-base font-semibold text-primary">$ {fmt(p.sale_price)}</p>
            </button>
          ))}
          {(products ?? []).length === 0 && (
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
                </div>
                <Button variant="ghost" size="icon" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="inline-flex items-center rounded-md border border-border">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => updateQty(i, -1)}><Minus className="size-3.5" /></Button>
                  <Input type="number" value={l.quantity} onChange={(e) => setCart((c) => c.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="w-14 h-8 text-center border-0" />
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
          <Dialog open={openPay} onOpenChange={setOpenPay}>
            <DialogTrigger asChild>
              <Button className="w-full h-11 text-base" disabled={cart.length === 0}>
                <Receipt className="size-4 mr-2" /> Cobrar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cobrar $ {fmt(total)}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "efectivo" as const, label: "Efectivo", icon: Banknote },
                    { v: "tarjeta" as const, label: "Tarjeta", icon: CreditCard },
                    { v: "transferencia" as const, label: "Transferencia", icon: ArrowRightLeft },
                    { v: "credito" as const, label: "Crédito", icon: Wallet },
                  ].map(({ v, label, icon: Icon }) => (
                    <button
                      key={v}
                      onClick={() => setPayment(v)}
                      className={
                        "rounded-lg border p-3 flex flex-col items-center gap-1 text-sm transition " +
                        (payment === v ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40")
                      }
                    >
                      <Icon className="size-5" /> {label}
                    </button>
                  ))}
                </div>
                {payment === "credito" && (
                  <div>
                    <Label>Cliente *</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona cliente…" /></SelectTrigger>
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
                <Button disabled={sell.isPending} onClick={() => sell.mutate()}>Confirmar cobro</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
