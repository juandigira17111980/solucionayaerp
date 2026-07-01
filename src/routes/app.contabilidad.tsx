import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, BookOpen, CheckCircle2, Layers, Sparkles, Trash2 } from "lucide-react";

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

  async function seed() {
    if (!activeCompanyId) return;
    const { error } = await supabase.rpc("seed_chart_of_accounts", { _company_id: activeCompanyId });
    if (error) return toast.error(error.message);
    toast.success("Plan de cuentas base creado");
    qc.invalidateQueries({ queryKey: ["coa"] });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finanzas"
        title="Contabilidad"
        description="Plan de cuentas y libro diario. Los documentos operativos generan asientos automáticamente."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Cuentas del plan" value={accounts.length} icon={Layers} />
        <StatCard label="Asientos registrados" value={entries.length} icon={BookOpen} />
        <StatCard
          label="Confirmados"
          value={entries.filter((e: any) => e.status === "confirmado").length}
          icon={CheckCircle2}
        />
      </div>

      <Tabs defaultValue="asientos">
        <TabsList>
          <TabsTrigger value="asientos">Libro diario</TabsTrigger>
          <TabsTrigger value="plan">Plan de cuentas</TabsTrigger>
        </TabsList>

        <TabsContent value="asientos" className="mt-4">
          <JournalTab entries={entries} accounts={accounts} companyId={activeCompanyId} />
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
      </Tabs>
    </div>
  );
}

function JournalTab({ entries, accounts, companyId }: { entries: any[]; accounts: any[]; companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function confirmEntry(id: string) {
    const { error } = await supabase.rpc("confirm_journal_entry", { _je_id: id });
    if (error) return toast.error(error.message);
    toast.success("Asiento confirmado");
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open && companyId && (
        <NewJournalDialog companyId={companyId} accounts={accounts} onClose={() => setOpen(false)} />
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

function NewJournalDialog({ companyId, accounts, onClose }: { companyId: string; accounts: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [head, setHead] = useState({ entry_date: new Date().toISOString().slice(0, 10), description: "", reference: "" });
  const [lines, setLines] = useState<Array<{ account_id: string; description: string; debit: number; credit: number }>>([
    { account_id: "", description: "", debit: 0, credit: 0 },
    { account_id: "", description: "", debit: 0, credit: 0 },
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
      const { data: doc } = await supabase.rpc("next_accounting_number", { _company_id: companyId, _kind: "journal" });
      const { data: je, error } = await supabase.from("journal_entries").insert({
        company_id: companyId,
        doc_number: doc as unknown as string,
        entry_date: head.entry_date,
        description: head.description || null,
        reference: head.reference || null,
        source_type: "manual",
      }).select("id").single();
      if (error) throw error;
      const { error: lerr } = await supabase.from("journal_entry_lines").insert(
        clean.map((l) => ({
          journal_entry_id: je.id,
          account_id: l.account_id,
          description: l.description || null,
          debit: l.debit || 0,
          credit: l.credit || 0,
        })),
      );
      if (lerr) throw lerr;
      if (confirm) {
        const { error: cerr } = await supabase.rpc("confirm_journal_entry", { _je_id: je.id });
        if (cerr) throw cerr;
      }
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
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { account_id: "", description: "", debit: 0, credit: 0 }])}>
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
