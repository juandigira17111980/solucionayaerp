import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Receipt, CheckCircle2, Wallet, Clock, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/hooks/use-active-company";
import { PageHeader, StatCard, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/gastos")({
  ssr: false,
  component: GastosPage,
});

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

function GastosPage() {
  const { activeCompanyId } = useActiveCompany();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, third_parties(legal_name, trade_name), chart_of_accounts(code, name)")
        .eq("company_id", activeCompanyId!)
        .order("expense_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return expenses.filter((e: any) =>
      !s ||
      e.doc_number?.toLowerCase().includes(s) ||
      e.description?.toLowerCase().includes(s) ||
      e.supplier_invoice?.toLowerCase().includes(s),
    );
  }, [expenses, q]);

  const totals = useMemo(() => {
    const pend = expenses.filter((e: any) => e.status === "confirmado").reduce((s: number, e: any) => s + Number(e.total || 0), 0);
    const paid = expenses.filter((e: any) => e.status === "pagado").reduce((s: number, e: any) => s + Number(e.total || 0), 0);
    return { pend, paid, count: expenses.length };
  }, [expenses]);

  async function confirmExpense(id: string) {
    const { error } = await supabase.rpc("confirm_expense", { _expense_id: id });
    if (error) return toast.error(error.message);
    toast.success("Gasto confirmado");
    qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finanzas"
        title="Gastos"
        description="Registra y controla los gastos operativos. Se integran con cuentas por pagar, tesorería y contabilidad."
        actions={
          <Button onClick={() => setOpen(true)} disabled={!activeCompanyId} className="gap-2">
            <Plus className="size-4" /> Nuevo gasto
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total registrados" value={totals.count} icon={Receipt} />
        <StatCard label="Pendientes de pago" value={fmt(totals.pend)} icon={Clock} />
        <StatCard label="Pagados" value={fmt(totals.paid)} icon={Wallet} />
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por documento, factura o descripción…" className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin gastos" description="Registra el primer gasto de la empresa activa." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.doc_number}</TableCell>
                  <TableCell>{e.expense_date}</TableCell>
                  <TableCell>{e.third_parties?.trade_name ?? e.third_parties?.legal_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.category ?? "—"}</TableCell>
                  <TableCell className="capitalize">{e.payment_method}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(e.total))}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-right">
                    {e.status === "borrador" && (
                      <Button size="sm" variant="outline" onClick={() => confirmExpense(e.id)} className="gap-1">
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

      {open && activeCompanyId && (
        <NewExpenseDialog companyId={activeCompanyId} onClose={() => setOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["expenses"] })} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    borrador: "bg-muted text-muted-foreground",
    confirmado: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    pagado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    anulado: "bg-destructive/15 text-destructive",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

function NewExpenseDialog({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    supplier_id: "",
    expense_account_id: "",
    category: "",
    expense_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    supplier_invoice: "",
    description: "",
    subtotal: 0,
    tax_amount: 0,
    payment_method: "credito",
    bank_account_id: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["third-parties-suppliers", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("third_parties").select("id, legal_name, trade_name")
        .eq("company_id", companyId).order("legal_name");
      return data ?? [];
    },
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["coa-expense", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("chart_of_accounts").select("id, code, name, account_type, is_postable")
        .eq("company_id", companyId).eq("is_postable", true).in("account_type", ["gasto", "costo"]).order("code");
      return data ?? [];
    },
  });
  const { data: banks = [] } = useQuery({
    queryKey: ["banks", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id, name")
        .eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const total = Number(form.subtotal || 0) + Number(form.tax_amount || 0);

  async function save() {
    if (!form.category && !form.expense_account_id) {
      return toast.error("Indica una categoría o cuenta contable");
    }
    if (total <= 0) return toast.error("El total debe ser mayor a cero");
    if (form.payment_method !== "credito" && !form.bank_account_id) {
      return toast.error("Selecciona una cuenta bancaria para el pago directo");
    }
    setSaving(true);
    try {
      const { data: doc } = await supabase.rpc("next_accounting_number", { _company_id: companyId, _kind: "expense" });
      const { error } = await supabase.from("expenses").insert({
        company_id: companyId,
        doc_number: doc as unknown as string,
        supplier_id: form.supplier_id || null,
        expense_account_id: form.expense_account_id || null,
        category: form.category || null,
        expense_date: form.expense_date,
        due_date: form.due_date || null,
        supplier_invoice: form.supplier_invoice || null,
        description: form.description || null,
        subtotal: form.subtotal,
        tax_amount: form.tax_amount,
        total,
        payment_method: form.payment_method,
        bank_account_id: form.bank_account_id || null,
      });
      if (error) throw error;
      toast.success("Gasto creado en borrador");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Proveedor</Label>
            <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
              <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cuenta contable (gasto)</Label>
            <Select value={form.expense_account_id} onValueChange={(v) => setForm({ ...form, expense_account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Opcional…" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoría</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Servicios, arriendo, etc." />
          </div>
          <div>
            <Label>Factura del proveedor</Label>
            <Input value={form.supplier_invoice} onChange={(e) => setForm({ ...form, supplier_invoice: e.target.value })} />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div>
            <Label>Vencimiento</Label>
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <Label>Subtotal</Label>
            <Input type="number" min={0} value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: Number(e.target.value) })} />
          </div>
          <div>
            <Label>IVA / Impuestos</Label>
            <Input type="number" min={0} value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credito">Crédito (genera CxP)</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.payment_method !== "credito" && (
            <div>
              <Label>Cuenta bancaria</Label>
              <Select value={form.bank_account_id} onValueChange={(v) => setForm({ ...form, bank_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2 rounded-md border border-border p-3 flex justify-between items-center bg-surface/40">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">{fmt(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear en borrador"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
