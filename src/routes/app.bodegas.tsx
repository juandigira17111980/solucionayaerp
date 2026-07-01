import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/bodegas")({
  component: BodegasPage,
});

const TYPE_LABEL: Record<string, string> = {
  bodega: "Bodega",
  centro_distribucion: "Centro de distribución",
  punto_venta: "Punto de venta",
};

function BodegasPage() {
  const qc = useQueryClient();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", warehouse_type: "bodega", address: "", is_active: true,
  });

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ["warehouses", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Selecciona una empresa");
      if (!form.code || !form.name) throw new Error("Código y nombre son obligatorios");
      const { error } = await supabase.from("warehouses").insert({
        company_id: activeCompanyId,
        code: form.code,
        name: form.name,
        warehouse_type: form.warehouse_type as "bodega" | "centro_distribucion" | "punto_venta",
        address: form.address || null,
        is_active: form.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bodega creada");
      setOpen(false);
      setForm({ code: "", name: "", warehouse_type: "bodega", address: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Bodegas"
        description={activeCompany ? `Bodegas, centros de distribución y puntos de venta de ${activeCompany.trade_name ?? activeCompany.legal_name}.` : "Selecciona una empresa activa."}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!activeCompanyId}><Plus className="size-4 mr-1" /> Nueva bodega</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva bodega</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Código *</Label>
                    <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label>Nombre *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.warehouse_type} onValueChange={(v) => setForm({ ...form, warehouse_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bodega">Bodega</SelectItem>
                      <SelectItem value="centro_distribucion">Centro de distribución</SelectItem>
                      <SelectItem value="punto_venta">Punto de venta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Dirección</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Activa</p>
                    <p className="text-xs text-muted-foreground">Las bodegas inactivas no aparecen en movimientos.</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
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
        <EmptyState icon={Warehouse} title="Sin empresa activa" description="Crea o selecciona una empresa para administrar sus bodegas." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : warehouses.length === 0 ? (
        <EmptyState icon={Warehouse} title="Aún no hay bodegas" description="Crea tu primera bodega, centro de distribución o punto de venta." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-sm">{w.code}</TableCell>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{TYPE_LABEL[w.warehouse_type]}</TableCell>
                  <TableCell className="text-muted-foreground">{w.address ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={w.is_active ? "default" : "outline"}>
                      {w.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
