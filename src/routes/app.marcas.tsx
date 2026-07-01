import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Factory } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/marcas")({ component: MarcasPage });

function MarcasPage() {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data = [], isLoading } = useQuery({
    queryKey: ["brands-list", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("*").eq("company_id", activeCompanyId!).order("name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !form.name) throw new Error("Nombre obligatorio");
      const { error } = await supabase.from("brands").insert({
        company_id: activeCompanyId, name: form.name, description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca creada");
      setOpen(false);
      setForm({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["brands-list"] });
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Maestros"
        title="Marcas"
        description="Marcas asociadas a los productos de la empresa."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button disabled={!activeCompanyId}><Plus className="size-4 mr-1" />Nueva marca</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva marca</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {!activeCompanyId ? <EmptyState icon={Factory} title="Sin empresa activa" />
      : isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
      : data.length === 0 ? <EmptyState icon={Factory} title="Sin marcas" />
      : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Descripción</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.description ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
