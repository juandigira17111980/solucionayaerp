import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Tags } from "lucide-react";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/categorias")({
  component: CategoriasPage,
});

function CategoriasPage() {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });

  const { data = [], isLoading } = useQuery({
    queryKey: ["categories-list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("product_categories").select("*").eq("company_id", activeCompanyId!).order("name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !form.name) throw new Error("Nombre obligatorio");
      const { error } = await supabase.from("product_categories").insert({
        company_id: activeCompanyId, name: form.name, code: form.code || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoría creada");
      setOpen(false);
      setForm({ name: "", code: "" });
      qc.invalidateQueries({ queryKey: ["categories-list"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Maestros"
        title="Categorías"
        description="Clasificación de productos por categoría (soporta subcategorías en fases posteriores)."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button disabled={!activeCompanyId}><Plus className="size-4 mr-1" />Nueva categoría</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {!activeCompanyId ? (
        <EmptyState icon={Tags} title="Sin empresa activa" />
      ) : isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
      : data.length === 0 ? <EmptyState icon={Tags} title="Sin categorías" description="Crea la primera para clasificar productos." />
      : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Código</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.code ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
