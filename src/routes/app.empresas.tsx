import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Building2, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/empresas")({
  component: EmpresasPage,
});

function EmpresasPage() {
  const qc = useQueryClient();
  const { activeCompanyId, setActiveCompany } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tax_id: "", legal_name: "", trade_name: "", address: "", phone: "", email: "",
  });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["my-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("legal_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.tax_id || !form.legal_name) throw new Error("NIT y razón social son obligatorios");
      const { data, error } = await supabase
        .from("companies")
        .insert({ ...form, trade_name: form.trade_name || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Empresa creada");
      setOpen(false);
      setForm({ tax_id: "", legal_name: "", trade_name: "", address: "", phone: "", email: "" });
      qc.invalidateQueries({ queryKey: ["my-companies"] });
      if (data) setActiveCompany(data.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Empresas"
        description="Administra las empresas que operan en el ERP. Cada empresa tiene su propia configuración, bodegas, maestros y transacciones."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4 mr-1" /> Nueva empresa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva empresa</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>NIT / Documento *</Label>
                  <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Razón social *</Label>
                  <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Nombre comercial</Label>
                  <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Dirección</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Teléfono</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? "Creando…" : "Crear empresa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aún no hay empresas"
          description="Crea tu primera empresa para comenzar a operar. Como primer usuario en crearla, serás el super administrador."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => {
            const active = c.id === activeCompanyId;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <Building2 className="size-5" />
                  </div>
                  {active && <Badge variant="secondary" className="gap-1"><Check className="size-3" /> Activa</Badge>}
                </div>
                <h3 className="mt-3 font-semibold">{c.trade_name ?? c.legal_name}</h3>
                <p className="text-xs text-muted-foreground truncate">{c.legal_name}</p>
                <p className="mt-2 text-xs text-muted-foreground">NIT {c.tax_id}</p>
                {!active && (
                  <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setActiveCompany(c.id)}>
                    Activar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
