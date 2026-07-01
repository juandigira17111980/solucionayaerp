import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Users } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useActiveCompany } from "@/hooks/use-active-company";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/terceros")({
  component: TercerosPage,
});

function TercerosPage() {
  const qc = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "cliente" | "proveedor" | "vendedor">("all");

  const [form, setForm] = useState({
    document_type: "NIT",
    document_number: "",
    legal_name: "",
    trade_name: "",
    email: "",
    phone: "",
    address: "",
    is_client: true,
    is_supplier: false,
    is_vendor: false,
    is_employee: false,
    credit_limit: 0,
    payment_terms_days: 0,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["third_parties", activeCompanyId, filter],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase.from("third_parties").select("*").eq("company_id", activeCompanyId!).order("legal_name").limit(500);
      if (filter === "cliente") q = q.eq("is_client", true);
      if (filter === "proveedor") q = q.eq("is_supplier", true);
      if (filter === "vendedor") q = q.eq("is_vendor", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Selecciona una empresa");
      if (!form.document_number || !form.legal_name) throw new Error("Documento y razón social son obligatorios");
      const { error } = await supabase.from("third_parties").insert({
        company_id: activeCompanyId,
        document_type: form.document_type as "NIT" | "CC" | "CE" | "PP" | "TI" | "RUT" | "OTRO",
        document_number: form.document_number,
        legal_name: form.legal_name,
        trade_name: form.trade_name || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        is_client: form.is_client,
        is_supplier: form.is_supplier,
        is_vendor: form.is_vendor,
        is_employee: form.is_employee,
        credit_limit: form.credit_limit,
        payment_terms_days: form.payment_terms_days,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tercero creado");
      setOpen(false);
      setForm({
        document_type: "NIT", document_number: "", legal_name: "", trade_name: "",
        email: "", phone: "", address: "",
        is_client: true, is_supplier: false, is_vendor: false, is_employee: false,
        credit_limit: 0, payment_terms_days: 0,
      });
      qc.invalidateQueries({ queryKey: ["third_parties"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Maestros"
        title="Terceros"
        description="Clientes, proveedores, vendedores y empleados. Un tercero puede tener varios roles."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!activeCompanyId}><Plus className="size-4 mr-1" /> Nuevo tercero</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Nuevo tercero</DialogTitle></DialogHeader>
              <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipo doc.</Label>
                    <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NIT", "CC", "CE", "PP", "TI", "RUT", "OTRO"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label>Número documento *</Label>
                    <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Razón social *</Label>
                  <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Nombre comercial</Label>
                  <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Dirección</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium mb-2">Roles</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k: "is_client", label: "Cliente" },
                      { k: "is_supplier", label: "Proveedor" },
                      { k: "is_vendor", label: "Vendedor" },
                      { k: "is_employee", label: "Empleado" },
                    ].map((r) => (
                      <label key={r.k} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form[r.k as keyof typeof form] as boolean}
                          onCheckedChange={(v) => setForm({ ...form, [r.k]: !!v })}
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Cupo crédito</Label>
                    <Input type="number" min="0" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Plazo de pago (días)</Label>
                    <Input type="number" min="0" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: parseInt(e.target.value) || 0 })} />
                  </div>
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
        <EmptyState icon={Users} title="Sin empresa activa" description="Selecciona una empresa para gestionar sus terceros." />
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="cliente">Clientes</TabsTrigger>
              <TabsTrigger value="proveedor">Proveedores</TabsTrigger>
              <TabsTrigger value="vendedor">Vendedores</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title="Sin terceros" description="Registra el primero para poder facturar, comprar o vender." />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Razón social</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Roles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.document_type} {t.document_number}</TableCell>
                      <TableCell>
                        <p className="font-medium">{t.legal_name}</p>
                        {t.trade_name && <p className="text-xs text-muted-foreground">{t.trade_name}</p>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {t.email ?? "—"}<br />{t.phone ?? ""}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {t.is_client && <Badge variant="secondary">Cliente</Badge>}
                        {t.is_supplier && <Badge variant="secondary">Proveedor</Badge>}
                        {t.is_vendor && <Badge variant="secondary">Vendedor</Badge>}
                        {t.is_employee && <Badge variant="secondary">Empleado</Badge>}
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
