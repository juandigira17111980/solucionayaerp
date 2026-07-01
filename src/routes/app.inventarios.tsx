import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Trash2, CheckCircle2, Search, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, PlusCircle, MinusCircle, Boxes, FileText, TrendingUp, Tag,
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

export const Route = createFileRoute("/app/inventarios")({ component: InventariosPage });

type MovementType = "entrada" | "salida" | "traslado" | "ajuste_positivo" | "ajuste_negativo";
const TYPE_LABEL: Record<MovementType, string> = {
  entrada: "Entrada",
  salida: "Salida",
  traslado: "Traslado",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (-)",
};
const TYPE_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  entrada: ArrowDownToLine,
  salida: ArrowUpFromLine,
  traslado: ArrowLeftRight,
  ajuste_positivo: PlusCircle,
  ajuste_negativo: MinusCircle,
};

const fmt = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

function InventariosPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Operación" title="Inventarios" description="Kardex, movimientos, existencias y costeo promedio ponderado." />
        <EmptyState
          icon={Boxes}
          title="Sin empresa activa"
          description="Selecciona o crea una empresa para operar inventarios."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Inventarios"
        description={`Movimientos, existencias y kardex — ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? ""}`}
      />
      <Tabs defaultValue="movimientos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="movimientos"><FileText className="size-4 mr-2" /> Movimientos</TabsTrigger>
          <TabsTrigger value="existencias"><Boxes className="size-4 mr-2" /> Existencias</TabsTrigger>
          <TabsTrigger value="kardex"><TrendingUp className="size-4 mr-2" /> Kardex</TabsTrigger>
          <TabsTrigger value="lotes"><Tag className="size-4 mr-2" /> Lotes</TabsTrigger>
        </TabsList>
        <TabsContent value="movimientos"><MovimientosTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="existencias"><ExistenciasTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="kardex"><KardexTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="lotes"><LotesTab companyId={activeCompanyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================================
 * MOVIMIENTOS
 * ==========================================================================*/

function MovimientosTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements", companyId, filterType],
    queryFn: async () => {
      let q = supabase
        .from("inventory_movements" as any)
        .select("*, warehouse_from:warehouses!warehouse_from_id(name,code), warehouse_to:warehouses!warehouse_to_id(name,code), third_parties(legal_name)")
        .eq("company_id", companyId)
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (filterType !== "all") q = q.eq("movement_type", filterType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(Object.keys(TYPE_LABEL) as MovementType[]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <NewMovementDialog companyId={companyId} open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["movements"] })} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Tercero</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>}
            {!isLoading && movements.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Sin movimientos. Crea el primero.</TableCell></TableRow>
            )}
            {movements.map((m: any) => {
              const Icon = TYPE_ICON[m.movement_type as MovementType];
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">{m.doc_number}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1.5"><Icon className="size-4 text-muted-foreground" />{TYPE_LABEL[m.movement_type as MovementType]}</span></TableCell>
                  <TableCell>{m.movement_date}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.warehouse_from?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.warehouse_to?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.third_parties?.legal_name ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell className="text-right">
                    <MovementActions movement={m} companyId={companyId} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    borrador: "bg-muted text-muted-foreground",
    confirmado: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    anulado: "bg-destructive/10 text-destructive",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

function MovementActions({ movement, companyId }: { movement: any; companyId: string }) {
  const qc = useQueryClient();
  const [detailOpen, setDetailOpen] = useState(false);

  const confirmMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("confirm_inventory_movement" as any, { _movement_id: movement.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento confirmado");
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["kardex"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo confirmar"),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_movements" as any).update({ status: "anulado" }).eq("id", movement.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movimiento anulado"); qc.invalidateQueries({ queryKey: ["movements"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="inline-flex gap-1">
      <Button variant="ghost" size="sm" onClick={() => setDetailOpen(true)}>Ver</Button>
      {movement.status === "borrador" && (
        <>
          <Button variant="ghost" size="sm" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending} className="text-emerald-600">
            <CheckCircle2 className="size-4 mr-1" /> Confirmar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => cancelMut.mutate()} className="text-destructive">
            Anular
          </Button>
        </>
      )}
      <MovementDetailDialog movement={movement} companyId={companyId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}

function MovementDetailDialog({ movement, open, onOpenChange }: { movement: any; companyId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: lines = [] } = useQuery({
    queryKey: ["movement-lines", movement.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movement_lines" as any)
        .select("*, products(sku, name), product_lots(lot_code)")
        .eq("movement_id", movement.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{TYPE_LABEL[movement.movement_type as MovementType]} — {movement.doc_number}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Info label="Fecha" value={movement.movement_date} />
          <Info label="Estado" value={movement.status} />
          <Info label="Origen" value={movement.warehouse_from?.name ?? "—"} />
          <Info label="Destino" value={movement.warehouse_to?.name ?? "—"} />
          {movement.reference && <Info label="Referencia" value={movement.reference} />}
          {movement.notes && <Info label="Notas" value={movement.notes} />}
        </div>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.products?.sku}</TableCell>
                  <TableCell>{l.products?.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.product_lots?.lot_code ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.serial_number ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(l.quantity, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(l.unit_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(Number(l.quantity) * Number(l.unit_cost))}</TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin líneas</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

/* ============================================================================
 * NEW MOVEMENT DIALOG
 * ==========================================================================*/

type LineDraft = {
  product_id: string;
  quantity: string;
  unit_cost: string;
  lot_id: string;
  serial_number: string;
};

function NewMovementDialog({ companyId, open, onOpenChange, onCreated }: {
  companyId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const [type, setType] = useState<MovementType>("entrada");
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseFrom, setWarehouseFrom] = useState("");
  const [warehouseTo, setWarehouseTo] = useState("");
  const [thirdParty, setThirdParty] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [confirmNow, setConfirmNow] = useState(true);

  function blankLine(): LineDraft {
    return { product_id: "", quantity: "1", unit_cost: "0", lot_id: "", serial_number: "" };
  }

  const needsFrom = type === "salida" || type === "traslado" || type === "ajuste_negativo";
  const needsTo = type === "entrada" || type === "traslado" || type === "ajuste_positivo";
  const needsCost = type === "entrada" || type === "ajuste_positivo";

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name, code").eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, sku, name, cost_price").eq("company_id", companyId).eq("is_active", true).order("name").limit(500);
      return data ?? [];
    },
  });
  const { data: thirdParties = [] } = useQuery({
    queryKey: ["third-parties-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("third_parties").select("id, legal_name").eq("company_id", companyId).eq("is_active", true).order("legal_name");
      return data ?? [];
    },
  });
  const { data: lots = [] } = useQuery({
    queryKey: ["lots", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("product_lots" as any).select("id, lot_code, product_id").eq("company_id", companyId);
      return (data ?? []) as any[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const cleanLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
      if (cleanLines.length === 0) throw new Error("Agrega al menos una línea válida");
      if (needsFrom && !warehouseFrom) throw new Error("Selecciona bodega origen");
      if (needsTo && !warehouseTo) throw new Error("Selecciona bodega destino");
      if (type === "traslado" && warehouseFrom === warehouseTo) throw new Error("Origen y destino deben ser distintos");

      const { data: docNum, error: numErr } = await supabase.rpc("next_movement_number" as any, { _company_id: companyId, _type: type });
      if (numErr) throw numErr;

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data: mov, error: movErr } = await supabase.from("inventory_movements" as any).insert({
        company_id: companyId,
        doc_number: docNum,
        movement_type: type,
        movement_date: movementDate,
        warehouse_from_id: needsFrom ? warehouseFrom : null,
        warehouse_to_id: needsTo ? warehouseTo : null,
        third_party_id: thirdParty || null,
        reference: reference || null,
        notes: notes || null,
        created_by: userId,
      }).select("id").single();
      if (movErr) throw movErr;

      const { error: linesErr } = await supabase.from("inventory_movement_lines" as any).insert(
        cleanLines.map(l => ({
          movement_id: (mov as any).id,
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
          lot_id: l.lot_id || null,
          serial_number: l.serial_number || null,
        }))
      );
      if (linesErr) throw linesErr;

      if (confirmNow) {
        const { error: confErr } = await supabase.rpc("confirm_inventory_movement" as any, { _movement_id: (mov as any).id });
        if (confErr) throw confErr;
      }
    },
    onSuccess: () => {
      toast.success(confirmNow ? "Movimiento creado y confirmado" : "Movimiento guardado en borrador");
      onCreated();
      onOpenChange(false);
      // reset
      setLines([blankLine()]);
      setReference(""); setNotes(""); setThirdParty("");
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear movimiento"),
  });

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4 mr-2" /> Nuevo movimiento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo movimiento de inventario</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as MovementType[]).map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} />
          </div>
          <div>
            <Label>Tercero</Label>
            <Select value={thirdParty} onValueChange={setThirdParty}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                {thirdParties.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.legal_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {needsFrom && (
            <div className="col-span-2">
              <Label>Bodega origen *</Label>
              <Select value={warehouseFrom} onValueChange={setWarehouseFrom}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {needsTo && (
            <div className="col-span-2">
              <Label>Bodega destino *</Label>
              <Select value={warehouseTo} onValueChange={setWarehouseTo}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label>Referencia</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Factura, remisión, orden…" />
          </div>
          <div className="col-span-full">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Líneas</Label>
            <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, blankLine()])}>
              <Plus className="size-4 mr-1" /> Agregar
            </Button>
          </div>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  {needsCost && <TableHead className="w-28">Costo unit.</TableHead>}
                  <TableHead className="w-36">Lote</TableHead>
                  <TableHead className="w-32">Serial</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const productLots = lots.filter((lot: any) => lot.product_id === l.product_id);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={l.product_id} onValueChange={(v) => {
                          const p = products.find((x: any) => x.id === v) as any;
                          updateLine(i, { product_id: v, unit_cost: needsCost ? String(p?.cost_price ?? 0) : l.unit_cost });
                        }}>
                          <SelectTrigger><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" min="0" value={l.quantity} onChange={e => updateLine(i, { quantity: e.target.value })} />
                      </TableCell>
                      {needsCost && (
                        <TableCell>
                          <Input type="number" step="0.01" min="0" value={l.unit_cost} onChange={e => updateLine(i, { unit_cost: e.target.value })} />
                        </TableCell>
                      )}
                      <TableCell>
                        <Select value={l.lot_id} onValueChange={(v) => updateLine(i, { lot_id: v })} disabled={!l.product_id}>
                          <SelectTrigger><SelectValue placeholder="(sin lote)" /></SelectTrigger>
                          <SelectContent>
                            {productLots.map((lot: any) => <SelectItem key={lot.id} value={lot.id}>{lot.lot_code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input value={l.serial_number} onChange={e => updateLine(i, { serial_number: e.target.value })} placeholder="—" />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="items-center gap-3">
          <label className="flex items-center gap-2 text-sm mr-auto">
            <input type="checkbox" checked={confirmNow} onChange={e => setConfirmNow(e.target.checked)} />
            Confirmar inmediatamente (impacta stock y kardex)
          </label>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? "Guardando…" : "Guardar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================================
 * EXISTENCIAS
 * ==========================================================================*/

function ExistenciasTab({ companyId }: { companyId: string }) {
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name, code").eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock", companyId, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("stock" as any)
        .select("*, products(sku, name, min_stock), warehouses(name, code)")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() =>
    rows.filter((r: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return r.products?.name?.toLowerCase().includes(s) || r.products?.sku?.toLowerCase().includes(s);
    }), [rows, search]);

  const totalValue = filtered.reduce((sum, r: any) => sum + Number(r.quantity) * Number(r.avg_cost), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las bodegas</SelectItem>
            {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar producto…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          Valor total: <span className="font-mono font-semibold text-foreground">${fmt(totalValue)}</span>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead className="text-right">Existencia</TableHead>
              <TableHead className="text-right">Costo prom.</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Alerta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Sin existencias. Registra un movimiento de entrada.</TableCell></TableRow>
            )}
            {filtered.map((r: any) => {
              const low = Number(r.quantity) <= Number(r.products?.min_stock ?? 0) && Number(r.products?.min_stock ?? 0) > 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.products?.sku}</TableCell>
                  <TableCell>{r.products?.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.warehouses?.code} — {r.warehouses?.name}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.quantity, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(r.avg_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(Number(r.quantity) * Number(r.avg_cost))}</TableCell>
                  <TableCell>{low && <Badge variant="outline" className="bg-amber-500/10 text-amber-600">Bajo mín.</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ============================================================================
 * KARDEX
 * ==========================================================================*/

function KardexTab({ companyId }: { companyId: string }) {
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");

  const { data: products = [] } = useQuery({
    queryKey: ["products-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, sku, name").eq("company_id", companyId).eq("is_active", true).order("name").limit(500);
      return data ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name, code").eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["kardex", companyId, productId, warehouseId],
    enabled: !!productId,
    queryFn: async () => {
      let q = supabase
        .from("kardex" as any)
        .select("*, warehouses(code, name), inventory_movements(doc_number, movement_type)")
        .eq("company_id", companyId)
        .eq("product_id", productId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="w-80"><SelectValue placeholder="Selecciona un producto…" /></SelectTrigger>
          <SelectContent>
            {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las bodegas</SelectItem>
            {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!productId && <EmptyState icon={TrendingUp} title="Selecciona un producto" description="El kardex muestra el detalle de entradas y salidas con saldo y costo promedio." />}

      {productId && (
        <div className="rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Bodega</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Saldo qty</TableHead>
                <TableHead className="text-right">Costo prom.</TableHead>
                <TableHead className="text-right">Valor saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
              {!isLoading && entries.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Sin movimientos para este producto.</TableCell></TableRow>}
              {entries.map((k: any) => (
                <TableRow key={k.id}>
                  <TableCell className="text-sm">{k.movement_date}</TableCell>
                  <TableCell className="font-mono text-xs">{k.inventory_movements?.doc_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.warehouses?.code}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={k.direction === "in" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}>
                      {k.direction === "in" ? "Entrada" : "Salida"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.quantity, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.unit_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.total_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.balance_qty, 2)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.balance_avg_cost)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(k.balance_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * LOTES
 * ==========================================================================*/

function LotesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", lot_code: "", expires_at: "", notes: "" });

  const { data: products = [] } = useQuery({
    queryKey: ["products-active", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, sku, name").eq("company_id", companyId).eq("is_active", true).order("name").limit(500);
      return data ?? [];
    },
  });

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["lots-list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_lots" as any)
        .select("*, products(sku, name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.product_id || !form.lot_code) throw new Error("Producto y código de lote son obligatorios");
      const { error } = await supabase.from("product_lots" as any).insert({
        company_id: companyId,
        product_id: form.product_id,
        lot_code: form.lot_code,
        expires_at: form.expires_at || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lote creado");
      setOpen(false);
      setForm({ product_id: "", lot_code: "", expires_at: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["lots-list"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4 mr-2" /> Nuevo lote</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo lote</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Producto *</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Código de lote *</Label>
                <Input value={form.lot_code} onChange={e => setForm({ ...form, lot_code: e.target.value })} />
              </div>
              <div>
                <Label>Fecha de vencimiento</Label>
                <Input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Crear lote</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!isLoading && lots.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Sin lotes registrados.</TableCell></TableRow>}
            {lots.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono">{l.lot_code}</TableCell>
                <TableCell>{l.products?.sku} — {l.products?.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.expires_at ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
