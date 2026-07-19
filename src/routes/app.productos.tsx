import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Package, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/app/productos")({
  component: ProductosPage,
});

type ProductType = "physical" | "service" | "consumable";

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  physical: "Producto",
  service: "Servicio",
  consumable: "Consumo",
};

const PRODUCT_TYPE_BADGE: Record<ProductType, string> = {
  physical: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  service: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  consumable: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

function defaultsForProductType(productType: ProductType) {
  if (productType === "service") {
    return { product_type: productType, tracks_inventory: false, is_sellable: true, is_purchasable: true, min_stock: 0 };
  }
  if (productType === "consumable") {
    return { product_type: productType, tracks_inventory: true, is_sellable: false, is_purchasable: true };
  }
  return { product_type: productType, tracks_inventory: true, is_sellable: true, is_purchasable: true };
}

function ProductosPage() {
  const qc = useQueryClient();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    sku: "", barcode: "", name: "", description: "",
    category_id: "", brand_id: "", uom_id: "",
    cost_price: 0, sale_price: 0, tax_rate: 19, min_stock: 0,
    product_type: "physical" as ProductType,
    tracks_inventory: true,
    is_sellable: true,
    is_purchasable: true,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", activeCompanyId, search],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, product_categories(name), brands(name), units_of_measure(symbol)")
        .eq("company_id", activeCompanyId!)
        .order("name")
        .limit(200);
      if (search) query = query.ilike("name", `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("id, name").eq("company_id", activeCompanyId!).order("name");
      return data ?? [];
    },
  });
  const { data: brands = [] } = useQuery({
    queryKey: ["brands", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("id, name").eq("company_id", activeCompanyId!).order("name");
      return data ?? [];
    },
  });
  const { data: uoms = [] } = useQuery({
    queryKey: ["uoms"],
    queryFn: async () => {
      const { data } = await supabase.from("units_of_measure").select("id, code, name, symbol").order("code");
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Selecciona una empresa");
      if (!form.sku || !form.name) throw new Error("SKU y nombre son obligatorios");
      const productPayload = {
        company_id: activeCompanyId,
        sku: form.sku,
        barcode: form.barcode || null,
        name: form.name,
        description: form.description || null,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        uom_id: form.uom_id || null,
        cost_price: form.cost_price,
        sale_price: form.sale_price,
        tax_rate: form.tax_rate,
        min_stock: form.tracks_inventory ? form.min_stock : 0,
        product_type: form.product_type,
        tracks_inventory: form.tracks_inventory,
        is_sellable: form.is_sellable,
        is_purchasable: form.is_purchasable,
      };
      const { error } = await (supabase as any).from("products").insert(productPayload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Producto creado");
      setOpen(false);
      setForm({
        sku: "", barcode: "", name: "", description: "",
        category_id: "", brand_id: "", uom_id: "",
        cost_price: 0, sale_price: 0, tax_rate: 19, min_stock: 0,
        product_type: "physical",
        tracks_inventory: true,
        is_sellable: true,
        is_purchasable: true,
      });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const currency = new Intl.NumberFormat("es-CO", {
    style: "currency", currency: activeCompany?.currency_code ?? "COP", maximumFractionDigits: 0,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Maestros"
        title="Productos"
        description="Catálogo de productos por empresa. Incluye SKU, código de barras, categoría, marca, unidad, precios e impuestos."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!activeCompanyId}><Plus className="size-4 mr-1" /> Nuevo producto</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuevo producto</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>SKU *</Label>
                    <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Código de barras</Label>
                    <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Nombre *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>Tipo *</Label>
                    <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, ...defaultsForProductType(v as ProductType) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physical">Producto</SelectItem>
                        <SelectItem value="service">Servicio</SelectItem>
                        <SelectItem value="consumable">Producto de consumo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Vendible</Label>
                    <div className="flex h-10 items-center rounded-md border border-input px-3">
                      <Switch checked={form.is_sellable} onCheckedChange={(v) => setForm({ ...form, is_sellable: v })} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Comprable</Label>
                    <div className="flex h-10 items-center rounded-md border border-input px-3">
                      <Switch checked={form.is_purchasable} onCheckedChange={(v) => setForm({ ...form, is_purchasable: v })} />
                    </div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Descripción</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Categoría</Label>
                    <Select value={form.category_id || undefined} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Marca</Label>
                    <Select value={form.brand_id || undefined} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Unidad</Label>
                    <Select value={form.uom_id || undefined} onValueChange={(v) => setForm({ ...form, uom_id: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {uoms.map((u) => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Costo</Label>
                    <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Precio venta</Label>
                    <Input type="number" min="0" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>IVA %</Label>
                    <Input type="number" min="0" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Stock mín.</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.min_stock}
                      disabled={!form.tracks_inventory}
                      onChange={(e) => setForm({ ...form, min_stock: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <Label>Controla inventario</Label>
                    <p className="text-xs text-muted-foreground">
                      Los servicios no generan stock; productos y consumo si mueven kardex.
                    </p>
                  </div>
                  <Switch
                    checked={form.tracks_inventory}
                    disabled
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {!activeCompanyId ? (
        <EmptyState icon={Package} title="Sin empresa activa" description="Selecciona o crea una empresa para administrar sus productos." />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="Sin productos" description="Registra tu primer producto para empezar." />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.units_of_measure && <span className="ml-2 text-xs text-muted-foreground">/ {(p.units_of_measure as { symbol: string }).symbol}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{(p.product_categories as { name: string } | null)?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{(p.brands as { name: string } | null)?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={PRODUCT_TYPE_BADGE[(p.product_type ?? "physical") as ProductType]}>
                          {PRODUCT_TYPE_LABEL[(p.product_type ?? "physical") as ProductType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={p.tracks_inventory ? "default" : "outline"}>{p.tracks_inventory ? "Inventario" : "Sin stock"}</Badge>
                          {p.is_sellable && <Badge variant="outline">Venta</Badge>}
                          {p.is_purchasable && <Badge variant="outline">Compra</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{currency.format(Number(p.cost_price))}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{currency.format(Number(p.sale_price))}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Activo" : "Inactivo"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
