import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, BookOpen, CheckCircle2, Layers, Sparkles, Trash2, CalendarDays, GitBranch, BarChart3, Lock, Unlock } from "lucide-react";

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

export const Route = createFileRoute("/app/contabilidad")({
  ssr: false,
  component: ContabilidadPage,
});

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

function ContabilidadPage() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["coa", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chart_of_accounts")
        .select("*").eq("company_id", activeCompanyId!).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["journal-entries", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entries")
        .select("*").eq("company_id", activeCompanyId!)
        .order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["accounting-periods", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("accounting_periods" as any)
        .select("*").eq("company_id", activeCompanyId!)
        .order("start_date", { ascending: false }).limit(36);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["cost-centers", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_centers" as any)
        .select("*").eq("company_id", activeCompanyId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: thirdParties = [] } = useQuery({
    queryKey: ["accounting-third-parties", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("third_parties")
        .select("id, name").eq("company_id", activeCompanyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function seed() {
    if (!activeCompanyId) return;
    const { error } = await supabase.rpc("seed_accounting_foundation" as any, { _company_id: activeCompanyId });
    if (error) return toast.error(error.message);
    toast.success("Plan de cuentas base creado");
    qc.invalidateQueries({ queryKey: ["coa"] });
    qc.invalidateQueries({ queryKey: ["accounting-periods"] });
    qc.invalidateQueries({ queryKey: ["cost-centers"] });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finanzas"
        title="Contabilidad"
        description="Plan de cuentas y libro diario. Los documentos operativos generan asientos automáticamente."
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Cuentas del plan" value={accounts.length} icon={Layers} />
        <StatCard label="Asientos registrados" value={entries.length} icon={BookOpen} />
        <StatCard
          label="Confirmados"
          value={entries.filter((e: any) => e.status === "confirmado").length}
          icon={CheckCircle2}
        />
        <StatCard label="Periodos abiertos" value={periods.filter((p: any) => p.status === "abierto").length} icon={CalendarDays} />
      </div>

      <Tabs defaultValue="asientos">
        <TabsList className="h-auto flex flex-wrap justify-start">
          <TabsTrigger value="asientos">Libro diario</TabsTrigger>
          <TabsTrigger value="plan">Plan de cuentas</TabsTrigger>
          <TabsTrigger value="periodos">Periodos</TabsTrigger>
          <TabsTrigger value="centros">Centros de costo</TabsTrigger>
          <TabsTrigger value="balance">Balance prueba</TabsTrigger>
          <TabsTrigger value="estados">Estados</TabsTrigger>
          <TabsTrigger value="libro">Libro</TabsTrigger>
          <TabsTrigger value="mayor">Mayor</TabsTrigger>
          <TabsTrigger value="auxiliares">Auxiliares</TabsTrigger>
          <TabsTrigger value="conciliacion">Conciliacion</TabsTrigger>
        </TabsList>

        <TabsContent value="asientos" className="mt-4">
          <JournalTab entries={entries} accounts={accounts} costCenters={costCenters} companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          {accounts.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Sin plan de cuentas"
              description="Crea un plan de cuentas base para tu empresa (PUC simplificado)."
              action={<Button onClick={seed} className="gap-2"><Sparkles className="size-4" /> Crear plan base</Button>}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Postable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-sm">{a.code}</TableCell>
                      <TableCell style={{ paddingLeft: `${Math.min(a.code.length, 6) * 8}px` }} className={a.is_postable ? "" : "font-semibold"}>
                        {a.name}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{a.account_type}</Badge></TableCell>
                      <TableCell>{a.is_postable ? "Sí" : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="periodos" className="mt-4">
          <PeriodsTab periods={periods} companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="centros" className="mt-4">
          <CostCentersTab costCenters={costCenters} companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="balance" className="mt-4">
          <TrialBalanceTab companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="estados" className="mt-4">
          <FinancialStatementsTab companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="libro" className="mt-4">
          <JournalBookTab companyId={activeCompanyId} />
        </TabsContent>

        <TabsContent value="mayor" className="mt-4">
          <LedgerTab companyId={activeCompanyId} accounts={accounts} />
        </TabsContent>

        <TabsContent value="auxiliares" className="mt-4">
          <ThirdPartyLedgerTab companyId={activeCompanyId} thirdParties={thirdParties} />
        </TabsContent>

        <TabsContent value="conciliacion" className="mt-4">
          <ReconciliationTab companyId={activeCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JournalTab({ entries, accounts, costCenters, companyId }: { entries: any[]; accounts: any[]; costCenters: any[]; companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function confirmEntry(id: string) {
    const { error } = await supabase.rpc("confirm_journal_entry", { _je_id: id });
    if (error) return toast.error(error.message);
    toast.success("Asiento confirmado");
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
  }

  async function reverseEntry(id: string) {
    const reason = window.prompt("Motivo del reverso");
    if (!reason) return;
    const { error } = await supabase.rpc("reverse_journal_entry" as any, {
      _journal_entry_id: id,
      _reversal_date: new Date().toISOString().slice(0, 10),
      _reason: reason,
    });
    if (error) return toast.error(error.message);
    toast.success("Reverso contable creado");
    qc.invalidateQueries({ queryKey: ["journal-entries"] });
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setOpen(true)} disabled={!companyId || accounts.length === 0} className="gap-2">
          <Plus className="size-4" /> Nuevo asiento
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={BookOpen} title="Sin asientos" description="Los movimientos operativos generarán asientos automáticamente." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e: any) => (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => setDetailId(e.id)}>
                  <TableCell className="font-medium">{e.doc_number}</TableCell>
                  <TableCell>{e.entry_date}</TableCell>
                  <TableCell className="text-muted-foreground">{e.reference ?? e.description ?? "—"}</TableCell>
                  <TableCell className="capitalize text-muted-foreground text-xs">{e.source_type ?? "manual"}</TableCell>
                  <TableCell className="text-right">{fmt(Number(e.total_debit))}</TableCell>
                  <TableCell className="text-right">{fmt(Number(e.total_credit))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      e.status === "confirmado" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
                      e.status === "anulado" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                    {e.status === "borrador" && (
                      <Button size="sm" variant="outline" onClick={() => confirmEntry(e.id)} className="gap-1">
                        <CheckCircle2 className="size-3.5" /> Confirmar
                      </Button>
                    )}
                    {e.status === "confirmado" && e.source_type !== "reversal" && (
                      <Button size="sm" variant="ghost" onClick={() => reverseEntry(e.id)} className="gap-1">
                        <Unlock className="size-3.5" /> Reversar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open && companyId && (
        <NewJournalDialog companyId={companyId} accounts={accounts} costCenters={costCenters} onClose={() => setOpen(false)} />
      )}
      {detailId && (
        <JournalDetail id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function JournalDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: entry } = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: async () => {
      const { data } = await supabase.from("journal_entries").select("*").eq("id", id).single();
      return data;
    },
  });
  const { data: lines = [] } = useQuery({
    queryKey: ["journal-entry-lines", id],
    queryFn: async () => {
      const { data } = await supabase.from("journal_entry_lines")
        .select("*, chart_of_accounts(code, name)").eq("journal_entry_id", id);
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Asiento {entry?.doc_number}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">{entry?.description ?? entry?.reference}</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Débito</TableHead>
              <TableHead className="text-right">Crédito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-xs">{l.chart_of_accounts?.code} {l.chart_of_accounts?.name}</TableCell>
                <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(Number(l.debit))}</TableCell>
                <TableCell className="text-right">{fmt(Number(l.credit))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function PeriodsTab({ periods, companyId }: { periods: any[]; companyId: string | null }) {
  const qc = useQueryClient();
  const { data: events = [] } = useQuery({
    queryKey: ["accounting-period-events", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_accounting_period_events" as any, { _company_id: companyId, _period_id: null });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function closePeriod(id: string) {
    const notes = window.prompt("Notas del cierre") ?? null;
    const { error } = await supabase.rpc("close_accounting_period" as any, { _period_id: id, _notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Periodo cerrado");
    qc.invalidateQueries({ queryKey: ["accounting-periods"] });
    qc.invalidateQueries({ queryKey: ["accounting-period-events"] });
  }

  async function reopenPeriod(id: string) {
    const reason = window.prompt("Motivo de reapertura") ?? null;
    const { error } = await supabase.rpc("reopen_accounting_period" as any, { _period_id: id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Periodo reabierto");
    qc.invalidateQueries({ queryKey: ["accounting-periods"] });
    qc.invalidateQueries({ queryKey: ["accounting-period-events"] });
  }

  async function lockPeriod(id: string) {
    const notes = window.prompt("Notas de bloqueo definitivo") ?? null;
    const { error } = await supabase.rpc("lock_accounting_period" as any, { _period_id: id, _notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Periodo bloqueado");
    qc.invalidateQueries({ queryKey: ["accounting-periods"] });
    qc.invalidateQueries({ queryKey: ["accounting-period-events"] });
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Periodo</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Hasta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 && (
              <TableRow><TableCell colSpan={5}><EmptyState icon={CalendarDays} title="Sin periodos" description="Inicializa la base contable para crear el periodo actual." /></TableCell></TableRow>
            )}
            {periods.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.period_code}</TableCell>
                <TableCell>{p.start_date}</TableCell>
                <TableCell>{p.end_date}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={p.status === "abierto" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {p.status === "abierto" ? (
                      <Button size="sm" variant="outline" disabled={!companyId} onClick={() => closePeriod(p.id)}><Lock className="size-3.5 mr-1" /> Cerrar</Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={!companyId || p.status === "bloqueado"} onClick={() => reopenPeriod(p.id)}><Unlock className="size-3.5 mr-1" /> Reabrir</Button>
                    )}
                    {p.status !== "bloqueado" && (
                      <Button size="sm" variant="secondary" disabled={!companyId} onClick={() => lockPeriod(p.id)}><Lock className="size-3.5 mr-1" /> Bloquear</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-semibold">Bitacora</div>
        <Table>
          <TableHeader><TableRow><TableHead>Evento</TableHead><TableHead>Periodo</TableHead><TableHead>Fecha</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin eventos de cierre.</TableCell></TableRow>}
            {events.slice(0, 12).map((event: any) => (
              <TableRow key={event.event_id}>
                <TableCell>{event.event_type}</TableCell>
                <TableCell>{event.period_code ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("es-CO")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CostCentersTab({ costCenters, companyId }: { costCenters: any[]; companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "" });

  async function save() {
    if (!companyId || !form.code || !form.name) return toast.error("Codigo y nombre son obligatorios");
    const { error } = await supabase.from("cost_centers" as any).insert({
      company_id: companyId,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Centro de costo creado");
    setForm({ code: "", name: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["cost-centers"] });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} disabled={!companyId}><Plus className="size-4 mr-1" /> Nuevo centro</Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costCenters.length === 0 && (
              <TableRow><TableCell colSpan={3}><EmptyState icon={GitBranch} title="Sin centros de costo" description="Crea centros para analizar gastos, ventas e inventario por area." /></TableCell></TableRow>
            )}
            {costCenters.map((cc: any) => (
              <TableRow key={cc.id}>
                <TableCell className="font-mono">{cc.code}</TableCell>
                <TableCell>{cc.name}</TableCell>
                <TableCell>{cc.is_active ? "Activo" : "Inactivo"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo centro de costo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Codigo</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrialBalanceTab({ companyId }: { companyId: string | null }) {
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: rows = [] } = useQuery({
    queryKey: ["trial-balance", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_trial_balance" as any, { _company_id: companyId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totals = rows.reduce((acc: any, row: any) => ({
    debit: acc.debit + Number(row.debit ?? 0),
    credit: acc.credit + Number(row.credit ?? 0),
  }), { debit: 0, credit: 0 });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Debito</TableHead>
              <TableHead className="text-right">Credito</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin movimientos confirmados en el periodo.</TableCell></TableRow>}
            {rows.map((row: any) => (
              <TableRow key={row.account_id}>
                <TableCell className="font-mono">{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.account_type}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.debit))}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.credit))}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(Number(row.balance))}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">Totales</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.debit)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(totals.credit)}</TableCell>
                <TableCell className={Math.abs(totals.debit - totals.credit) < 0.01 ? "text-right text-emerald-600 font-semibold" : "text-right text-destructive font-semibold"}>
                  {fmt(totals.debit - totals.credit)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FinancialStatementsTab({ companyId }: { companyId: string | null }) {
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const position = useQuery({
    queryKey: ["financial-position", companyId, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_financial_position" as any, { _company_id: companyId, _to: to });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const income = useQuery({
    queryKey: ["income-statement", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_income_statement" as any, { _company_id: companyId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const assets = (position.data ?? []).filter((r: any) => r.section === "ACTIVO").reduce((s: number, r: any) => s + Number(r.balance), 0);
  const liabilities = (position.data ?? []).filter((r: any) => r.section === "PASIVO").reduce((s: number, r: any) => s + Number(r.balance), 0);
  const equity = (position.data ?? []).filter((r: any) => r.section === "PATRIMONIO").reduce((s: number, r: any) => s + Number(r.balance), 0);
  const net = (income.data ?? []).find((r: any) => r.code === "UO")?.amount ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div><Label>Desde PyG</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <StatCard label="Activos" value={fmt(assets)} icon={Layers} />
        <StatCard label="Resultado" value={fmt(Number(net))} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ReportTable
          title="Balance general"
          rows={position.data ?? []}
          columns={["section", "code", "name", "balance"]}
          footerLabel="Activos - Pasivos - Patrimonio"
          footerValue={assets - liabilities - equity}
        />
        <ReportTable
          title="Estado de resultados"
          rows={income.data ?? []}
          columns={["section", "code", "name", "amount"]}
        />
      </div>
    </div>
  );
}

function JournalBookTab({ companyId }: { companyId: string | null }) {
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("all");

  const { data: rows = [] } = useQuery({
    queryKey: ["journal-book", companyId, from, to, source],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_journal_book" as any, {
        _company_id: companyId,
        _from: from,
        _to: to,
        _source_type: source === "all" ? null : source,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const totals = rows.reduce((acc: any, row: any) => ({ debit: acc.debit + Number(row.debit), credit: acc.credit + Number(row.credit) }), { debit: 0, credit: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label>Origen</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="sale">Ventas/POS</SelectItem>
              <SelectItem value="purchase_receipt">Compras</SelectItem>
              <SelectItem value="treasury">Tesoreria</SelectItem>
              <SelectItem value="inventory">Inventario</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <StatCard label="Diferencia" value={fmt(totals.debit - totals.credit)} icon={CheckCircle2} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Doc</TableHead><TableHead>Cuenta</TableHead><TableHead>Tercero</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Debito</TableHead><TableHead className="text-right">Credito</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin asientos para los filtros.</TableCell></TableRow>}
            {rows.map((row: any, idx: number) => (
              <TableRow key={`${row.entry_id}-${idx}`}>
                <TableCell>{row.entry_date}</TableCell>
                <TableCell className="font-mono">{row.doc_number}</TableCell>
                <TableCell>{row.account_code} {row.account_name}</TableCell>
                <TableCell>{row.third_party_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.line_description ?? row.reference}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.debit))}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.credit))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LedgerTab({ companyId, accounts }: { companyId: string | null; accounts: any[] }) {
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const postable = accounts.filter((a: any) => a.is_postable);

  const { data: rows = [] } = useQuery({
    queryKey: ["account-ledger", companyId, accountId, from, to],
    enabled: !!companyId && !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_account_ledger" as any, { _company_id: companyId, _account_id: accountId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <Label>Cuenta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger>
            <SelectContent>{postable.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <SimpleMoneyTable rows={rows} empty="Selecciona una cuenta para ver el mayor." columns={["entry_date", "doc_number", "description", "debit", "credit", "running_balance"]} />
    </div>
  );
}

function ThirdPartyLedgerTab({ companyId, thirdParties }: { companyId: string | null; thirdParties: any[] }) {
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [thirdPartyId, setThirdPartyId] = useState("all");

  const { data: rows = [] } = useQuery({
    queryKey: ["third-party-ledger", companyId, thirdPartyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_third_party_ledger" as any, {
        _company_id: companyId,
        _third_party_id: thirdPartyId === "all" ? null : thirdPartyId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="sm:col-span-2">
          <Label>Tercero</Label>
          <Select value={thirdPartyId} onValueChange={setThirdPartyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {thirdParties.map((tp: any) => <SelectItem key={tp.id} value={tp.id}>{tp.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SimpleMoneyTable rows={rows} empty="Sin auxiliares para los filtros." columns={["third_party_name", "account_code", "entry_date", "doc_number", "debit", "credit", "balance"]} />
    </div>
  );
}

function ReconciliationTab({ companyId }: { companyId: string | null }) {
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: rows = [] } = useQuery({
    queryKey: ["ar-ap-reconciliation", companyId, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_ar_ap_reconciliation" as any, { _company_id: companyId, _to: to });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const diff = rows.reduce((sum: number, row: any) => sum + Math.abs(Number(row.difference)), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Label>Corte</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <StatCard label="Registros" value={rows.length} icon={BookOpen} />
        <StatCard label="Diferencia total" value={fmt(diff)} icon={CheckCircle2} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Modulo</TableHead><TableHead>Tercero</TableHead><TableHead className="text-right">Operativo</TableHead><TableHead className="text-right">Contable</TableHead><TableHead className="text-right">Diferencia</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin saldos pendientes por conciliar.</TableCell></TableRow>}
            {rows.map((row: any) => (
              <TableRow key={`${row.module}-${row.third_party_id ?? "none"}`}>
                <TableCell>{row.module}</TableCell>
                <TableCell>{row.third_party_name}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.operational_balance))}</TableCell>
                <TableCell className="text-right">{fmt(Number(row.accounting_balance))}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(Number(row.difference))}</TableCell>
                <TableCell><Badge variant="outline" className={row.status === "conciliado" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}>{row.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReportTable({ title, rows, columns, footerLabel, footerValue }: { title: string; rows: any[]; columns: string[]; footerLabel?: string; footerValue?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-semibold">{title}</div>
      <Table>
        <TableHeader><TableRow>{columns.map((c) => <TableHead key={c} className={["balance", "amount"].includes(c) ? "text-right" : ""}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Sin informacion para los filtros.</TableCell></TableRow>}
          {rows.map((row: any, idx: number) => (
            <TableRow key={`${row.code}-${idx}`}>
              {columns.map((c) => <TableCell key={c} className={["balance", "amount"].includes(c) ? "text-right font-medium" : ""}>{["balance", "amount"].includes(c) ? fmt(Number(row[c])) : row[c]}</TableCell>)}
            </TableRow>
          ))}
          {footerLabel && (
            <TableRow>
              <TableCell colSpan={columns.length - 1} className="font-semibold">{footerLabel}</TableCell>
              <TableCell className={Math.abs(Number(footerValue)) < 0.01 ? "text-right font-semibold text-emerald-600" : "text-right font-semibold text-destructive"}>{fmt(Number(footerValue))}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SimpleMoneyTable({ rows, columns, empty }: { rows: any[]; columns: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow>{columns.map((c) => <TableHead key={c} className={["debit", "credit", "balance", "running_balance"].includes(c) ? "text-right" : ""}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{empty}</TableCell></TableRow>}
          {rows.map((row: any, idx: number) => (
            <TableRow key={idx}>
              {columns.map((c) => (
                <TableCell key={c} className={["debit", "credit", "balance", "running_balance"].includes(c) ? "text-right font-medium" : ""}>
                  {["debit", "credit", "balance", "running_balance"].includes(c) ? fmt(Number(row[c])) : row[c]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NewJournalDialog({ companyId, accounts, costCenters, onClose }: { companyId: string; accounts: any[]; costCenters: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [head, setHead] = useState({ entry_date: new Date().toISOString().slice(0, 10), description: "", reference: "" });
  const [lines, setLines] = useState<Array<{ account_id: string; cost_center_id: string; description: string; debit: number; credit: number }>>([
    { account_id: "", cost_center_id: "", description: "", debit: 0, credit: 0 },
    { account_id: "", cost_center_id: "", description: "", debit: 0, credit: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const postable = useMemo(() => accounts.filter((a: any) => a.is_postable), [accounts]);
  const totals = useMemo(() => ({
    d: lines.reduce((s, l) => s + Number(l.debit || 0), 0),
    c: lines.reduce((s, l) => s + Number(l.credit || 0), 0),
  }), [lines]);

  function updateLine(i: number, patch: Partial<typeof lines[number]>) {
    setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }

  async function save(confirm: boolean) {
    if (Math.round(totals.d * 100) !== Math.round(totals.c * 100)) {
      return toast.error("El asiento debe estar cuadrado (débito = crédito)");
    }
    if (totals.d === 0) return toast.error("Ingresa al menos un movimiento");
    const clean = lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
    if (clean.length < 2) return toast.error("Se requieren al menos 2 líneas con cuenta");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("create_journal_entry" as any, {
        _company_id: companyId,
        _entry_date: head.entry_date,
        _voucher_type_code: "DIARIO",
        _reference: head.reference || null,
        _description: head.description || null,
        _source_type: "manual",
        _source_id: null,
        _lines: clean.map((l) => ({
          account_id: l.account_id,
          cost_center_id: l.cost_center_id || null,
          description: l.description || null,
          debit: l.debit || 0,
          credit: l.credit || 0,
        })),
        _confirm: confirm,
      });
      if (error) throw error;
      toast.success(confirm ? "Asiento confirmado" : "Asiento creado");
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Nuevo asiento manual</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={head.entry_date} onChange={(e) => setHead({ ...head, entry_date: e.target.value })} />
          </div>
          <div>
            <Label>Referencia</Label>
            <Input value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} />
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Cuenta</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select value={l.account_id} onValueChange={(v) => updateLine(i, { account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Cuenta…" /></SelectTrigger>
                      <SelectContent>
                        {postable.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={l.cost_center_id} onValueChange={(v) => updateLine(i, { cost_center_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Centro" /></SelectTrigger>
                      <SelectContent>
                        {costCenters.map((cc: any) => (
                          <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" min={0} value={l.debit} onChange={(e) => updateLine(i, { debit: Number(e.target.value), credit: 0 })} className="text-right" /></TableCell>
                  <TableCell><Input type="number" min={0} value={l.credit} onChange={(e) => updateLine(i, { credit: Number(e.target.value), debit: 0 })} className="text-right" /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between items-center text-sm">
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { account_id: "", cost_center_id: "", description: "", debit: 0, credit: 0 }])}>
            + Agregar línea
          </Button>
          <div className="flex gap-6">
            <span>Débito: <strong>{fmt(totals.d)}</strong></span>
            <span>Crédito: <strong>{fmt(totals.c)}</strong></span>
            <span className={Math.abs(totals.d - totals.c) < 0.01 ? "text-emerald-600" : "text-destructive"}>
              Diferencia: {fmt(totals.d - totals.c)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Guardar borrador</Button>
          <Button onClick={() => save(true)} disabled={saving}>Guardar y confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
