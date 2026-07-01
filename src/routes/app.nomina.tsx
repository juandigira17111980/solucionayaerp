import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users, CalendarDays, Calculator, CheckCircle2, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader, StatCard, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/app/nomina")({
  ssr: false,
  component: NominaPage,
});

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

function NominaPage() {
  const { activeCompanyId } = useActiveCompany();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*")
        .eq("company_id", activeCompanyId!).order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["payroll-periods", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("*")
        .eq("company_id", activeCompanyId!).order("period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const active = employees.filter((e: any) => e.status === "activo");

  return (
    <div>
      <PageHeader
        eyebrow="Personas"
        title="Nómina"
        description="Empleados y liquidación de periodos de nómina con devengados, deducciones y neto a pagar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Empleados activos" value={active.length} icon={Users} />
        <StatCard label="Periodos" value={periods.length} icon={CalendarDays} />
        <StatCard
          label="Neto último periodo"
          value={fmt(Number(periods[0]?.total_net ?? 0))}
          icon={Calculator}
        />
      </div>

      <Tabs defaultValue="periodos">
        <TabsList>
          <TabsTrigger value="periodos">Periodos</TabsTrigger>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
        </TabsList>
        <TabsContent value="periodos" className="mt-4">
          <PeriodsTab periods={periods} employees={active} companyId={activeCompanyId} />
        </TabsContent>
        <TabsContent value="empleados" className="mt-4">
          <EmployeesTab employees={employees} companyId={activeCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------ EMPLOYEES ------------------
function EmployeesTab({ employees, companyId }: { employees: any[]; companyId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} disabled={!companyId} className="gap-2">
          <UserPlus className="size-4" /> Nuevo empleado
        </Button>
      </div>
      {employees.length === 0 ? (
        <EmptyState icon={Users} title="Sin empleados" description="Registra empleados para poder generar nóminas." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead className="text-right">Salario base</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.code}</TableCell>
                  <TableCell className="font-medium">{e.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.position ?? "—"}</TableCell>
                  <TableCell>{e.hire_date ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(Number(e.base_salary))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      e.status === "activo" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
                      e.status === "retirado" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }>{e.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {open && companyId && <NewEmployeeDialog companyId={companyId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewEmployeeDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: "", document_number: "", full_name: "", email: "", phone: "",
    position: "", department: "", hire_date: new Date().toISOString().slice(0, 10),
    base_salary: 0, payment_method: "transferencia", bank_account: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.code || !form.full_name) return toast.error("Código y nombre son obligatorios");
    setSaving(true);
    try {
      const { error } = await supabase.from("employees").insert({ company_id: companyId, ...form });
      if (error) throw error;
      toast.success("Empleado creado");
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><Label>Documento</Label><Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Nombre completo *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Cargo</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          <div><Label>Área</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div><Label>Fecha de ingreso</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          <div><Label>Salario base</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
          <div>
            <Label>Método de pago</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Cuenta bancaria</Label><Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear empleado"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------ PERIODS ------------------
function PeriodsTab({ periods, employees, companyId }: { periods: any[]; employees: any[]; companyId: string | null }) {
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} disabled={!companyId || employees.length === 0} className="gap-2">
          <Plus className="size-4" /> Nuevo periodo
        </Button>
      </div>
      {periods.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin periodos" description="Crea un periodo para generar la nómina." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead className="text-right">Devengado</TableHead>
                <TableHead className="text-right">Deducciones</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p: any) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetailId(p.id)}>
                  <TableCell className="font-medium">{p.doc_number}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.period_start}</TableCell>
                  <TableCell>{p.period_end}</TableCell>
                  <TableCell className="text-right">{fmt(Number(p.total_gross))}</TableCell>
                  <TableCell className="text-right">{fmt(Number(p.total_deductions))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(Number(p.total_net))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      p.status === "liquidada" || p.status === "pagada" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
                      p.status === "anulada" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }>{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {open && companyId && <NewPeriodDialog companyId={companyId} employees={employees} onClose={() => setOpen(false)} onCreated={(id) => { setOpen(false); setDetailId(id); }} />}
      {detailId && <PeriodDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function NewPeriodDialog({ companyId, employees, onClose, onCreated }: { companyId: string; employees: any[]; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: `Nómina ${today.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`,
    period_start: first, period_end: last, pay_date: last, frequency: "mensual",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { data: doc } = await supabase.rpc("next_accounting_number", { _company_id: companyId, _kind: "payroll" });
      const { data: period, error } = await supabase.from("payroll_periods").insert({
        company_id: companyId,
        doc_number: doc as unknown as string,
        ...form,
      }).select("id").single();
      if (error) throw error;
      // Seed items with active employees
      const { error: ierr } = await supabase.from("payroll_items").insert(
        employees.map((e: any) => ({
          payroll_period_id: period.id,
          employee_id: e.id,
          base_salary: e.base_salary,
          worked_days: 30,
          gross_amount: e.base_salary,
          health_deduction: Math.round(Number(e.base_salary) * 0.04),
          pension_deduction: Math.round(Number(e.base_salary) * 0.04),
          net_amount: Number(e.base_salary) - Math.round(Number(e.base_salary) * 0.08),
        })),
      );
      if (ierr) throw ierr;
      toast.success("Periodo creado con empleados activos");
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      onCreated(period.id);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo periodo de nómina</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Inicio</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
          <div><Label>Fin</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          <div><Label>Fecha de pago</Label><Input type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} /></div>
          <div>
            <Label>Frecuencia</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="quincenal">Quincenal</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Se cargarán {employees.length} empleados activos con deducciones estimadas (salud 4% + pensión 4%).
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creando…" : "Crear periodo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeriodDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: period } = useQuery({
    queryKey: ["period", id],
    queryFn: async () => (await supabase.from("payroll_periods").select("*").eq("id", id).single()).data,
  });
  const { data: items = [], refetch } = useQuery({
    queryKey: ["period-items", id],
    queryFn: async () => (await supabase.from("payroll_items")
      .select("*, employees(full_name, code)").eq("payroll_period_id", id)
      .order("created_at")).data ?? [],
  });

  const totals = useMemo(() => ({
    g: items.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0),
    d: items.reduce((s: number, i: any) => s + Number(i.health_deduction) + Number(i.pension_deduction) + Number(i.other_deductions), 0),
    n: items.reduce((s: number, i: any) => s + Number(i.net_amount || 0), 0),
  }), [items]);

  async function updateItem(itemId: string, patch: any) {
    const { error } = await supabase.from("payroll_items").update(patch).eq("id", itemId);
    if (error) return toast.error(error.message);
    refetch();
  }

  async function liquidate() {
    const { error } = await supabase.rpc("liquidate_payroll_period", { _period_id: id });
    if (error) return toast.error(error.message);
    toast.success("Nómina liquidada");
    qc.invalidateQueries({ queryKey: ["payroll-periods"] });
    qc.invalidateQueries({ queryKey: ["period", id] });
    refetch();
  }

  const editable = period?.status === "borrador";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{period?.doc_number} — {period?.name}</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-border overflow-hidden max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead className="text-right">Salario base</TableHead>
                <TableHead className="text-right">Días</TableHead>
                <TableHead className="text-right">Bonos</TableHead>
                <TableHead className="text-right">Horas extra</TableHead>
                <TableHead className="text-right">Salud</TableHead>
                <TableHead className="text-right">Pensión</TableHead>
                <TableHead className="text-right">Otras ded.</TableHead>
                <TableHead className="text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.employees?.full_name}</TableCell>
                  <TableCell className="text-right">{fmt(Number(i.base_salary))}</TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-20 ml-auto text-right" defaultValue={i.worked_days}
                      onBlur={(e) => updateItem(i.id, { worked_days: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-28 ml-auto text-right" defaultValue={i.bonuses}
                      onBlur={(e) => updateItem(i.id, { bonuses: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-28 ml-auto text-right" defaultValue={i.overtime}
                      onBlur={(e) => updateItem(i.id, { overtime: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-28 ml-auto text-right" defaultValue={i.health_deduction}
                      onBlur={(e) => updateItem(i.id, { health_deduction: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-28 ml-auto text-right" defaultValue={i.pension_deduction}
                      onBlur={(e) => updateItem(i.id, { pension_deduction: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input disabled={!editable} type="number" className="w-28 ml-auto text-right" defaultValue={i.other_deductions}
                      onBlur={(e) => updateItem(i.id, { other_deductions: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(Number(i.net_amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap gap-6 text-sm justify-end">
          <span>Devengado: <strong>{fmt(totals.g)}</strong></span>
          <span>Deducciones: <strong>{fmt(totals.d)}</strong></span>
          <span>Neto: <strong>{fmt(totals.n)}</strong></span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {editable && (
            <Button onClick={liquidate} className="gap-2">
              <CheckCircle2 className="size-4" /> Liquidar nómina
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
