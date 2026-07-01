import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, Trash2, CheckCircle2, Ban, Search, Wallet, Landmark,
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, PlusCircle, MinusCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/app/tesoreria")({ component: TesoreriaPage });

const sb = supabase as any;
const fmt = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

type TxnType = "cobro" | "pago" | "transferencia" | "ajuste_positivo" | "ajuste_negativo";
const TXN_LABEL: Record<TxnType, string> = {
  cobro: "Cobro", pago: "Pago", transferencia: "Transferencia",
  ajuste_positivo: "Ajuste (+)", ajuste_negativo: "Ajuste (-)",
};
const TXN_ICON: Record<TxnType, React.ComponentType<{ className?: string }>> = {
  cobro: ArrowDownCircle, pago: ArrowUpCircle, transferencia: ArrowLeftRight,
  ajuste_positivo: PlusCircle, ajuste_negativo: MinusCircle,
};
const STATUS_BADGE: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  confirmado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  anulado: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function TesoreriaPage() {
  const { activeCompanyId, activeCompany } = useActiveCompany();

  if (!activeCompanyId) {
    return (
      <div>
        <PageHeader eyebrow="Tesorería" title="Tesorería" description="Cuentas, cobros, pagos y transferencias." />
        <EmptyState icon={Wallet} title="Sin empresa activa" description="Selecciona o crea una empresa para operar tesorería." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Tesorería"
        description={`Cuentas y movimientos — ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? ""}`}
      />
      <Tabs defaultValue="cuentas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cuentas"><Landmark className="size-4 mr-2" /> Cuentas</TabsTrigger>
          <TabsTrigger value="movimientos"><ArrowLeftRight className="size-4 mr-2" /> Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="cuentas"><CuentasTab companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="movimientos"><MovimientosTab companyId={activeCompanyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// CUENTAS BANCARIAS
// ============================================================
function CuentasTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("bank_accounts").select("*")
        .eq("company_id", companyId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalCash = useMemo(() => (accounts ?? []).reduce((s: number, a: any) => s + Number(a.current_balance), 0), [accounts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Efectivo total</p>
          <p className="mt-2 text-2xl font-semibold">$ {fmt(totalCash)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cuentas activas</p>
          <p className="mt-2 text-2xl font-semibold">{(accounts ?? []).filter((a: any) => a.is_active).length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cuentas totales</p>
          <p className="mt-2 text-2xl font-semibold">{accounts?.length ?? 0}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Nueva cuenta</Button></DialogTrigger>
          <NewAccountDialog companyId={companyId} onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] }); }} />
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Número</TableHead>
              <TableHead className="text-right">Saldo inicial</TableHead>
              <TableHead className="text-right">Saldo actual</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : (accounts ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7}>
                <EmptyState icon={Landmark} title="Sin cuentas" description="Crea una caja o cuenta bancaria para registrar movimientos." />
              </TableCell></TableRow>
            ) : (accounts ?? []).map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">{a.kind}</TableCell>
                <TableCell className="text-sm">{a.bank_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{a.account_number ?? "—"}</TableCell>
                <TableCell className="text-right">$ {fmt(a.opening_balance)}</TableCell>
                <TableCell className="text-right font-semibold">$ {fmt(a.current_balance)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={a.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground"}>
                    {a.is_active ? "activa" : "inactiva"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewAccountDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("banco");
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [opening, setOpening] = useState(0);

  const save = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Nombre requerido");
      const { error } = await sb.from("bank_accounts").insert({
        company_id: companyId, name, kind, bank_name: bank || null,
        account_number: number || null, opening_balance: opening, current_balance: opening,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cuenta creada"); onClose(); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nueva cuenta / caja</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Nombre *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja principal / Bancolombia ahorros" /></div>
        <div>
          <Label>Tipo</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="caja">Caja</SelectItem>
              <SelectItem value="banco">Banco</SelectItem>
              <SelectItem value="tarjeta">Tarjeta</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Banco</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} /></div>
          <div><Label>Número de cuenta</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        </div>
        <div><Label>Saldo inicial</Label><Input type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(Number(e.target.value))} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>Crear cuenta</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ============================================================
// MOVIMIENTOS
// ============================================================
function MovimientosTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: txns, isLoading } = useQuery({
    queryKey: ["treasury-txns", companyId],
    queryFn: async () => {
      const { data, error } = await sb.from("treasury_transactions")
        .select("*, account:bank_accounts!bank_account_id(name), account_to:bank_accounts!bank_account_to_id(name), third:third_parties(legal_name, trade_name)")
        .eq("company_id", companyId).order("txn_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const confirmTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("confirm_treasury_transaction", { _txn_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-txns", companyId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-payable", companyId] });
      toast.success("Movimiento confirmado");
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const voidTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("void_treasury_transaction", { _txn_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-txns", companyId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-payable", companyId] });
      toast.success("Movimiento anulado");
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const filtered = useMemo(() => {
    if (!txns) return [];
    const q = search.toLowerCase();
    return txns.filter((t: any) =>
      !q || t.doc_number.toLowerCase().includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.third?.legal_name?.toLowerCase().includes(q)
    );
  }, [txns, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por número, referencia o tercero…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Nuevo movimiento</Button></DialogTrigger>
          <NewTxnDialog companyId={companyId} onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Tercero</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9}>
                <EmptyState icon={Wallet} title="Sin movimientos" description="Registra cobros, pagos y transferencias." />
              </TableCell></TableRow>
            ) : filtered.map((t: any) => {
              const Icon = TXN_ICON[t.txn_type as TxnType] ?? Wallet;
              return (
                <TableRow key={t.id}>
                  <TableCell><div className="inline-flex items-center gap-1.5 text-sm"><Icon className="size-4 text-muted-foreground" /> {TXN_LABEL[t.txn_type as TxnType]}</div></TableCell>
                  <TableCell className="font-mono text-sm">{t.doc_number}</TableCell>
                  <TableCell>{t.txn_date}</TableCell>
                  <TableCell className="text-sm">
                    {t.account?.name}
                    {t.txn_type === "transferencia" && <> → {t.account_to?.name}</>}
                  </TableCell>
                  <TableCell className="text-sm">{t.third?.trade_name ?? t.third?.legal_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.reference ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">$ {fmt(t.amount)}</TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS_BADGE[t.status] ?? ""}>{t.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {t.status === "borrador" && (
                      <Button size="sm" variant="outline" disabled={confirmTx.isPending} onClick={() => confirmTx.mutate(t.id)}>
                        <CheckCircle2 className="size-4 mr-1" /> Confirmar
                      </Button>
                    )}
                    {t.status === "confirmado" && (
                      <Button size="sm" variant="ghost" disabled={voidTx.isPending} onClick={() => voidTx.mutate(t.id)}>
                        <Ban className="size-4 mr-1" /> Anular
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type AppLine = { doc_id: string; doc_number: string; balance: number; amount: number };

function NewTxnDialog({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<TxnType>("cobro");
  const [accountId, setAccountId] = useState("");
  const [accountToId, setAccountToId] = useState("");
  const [thirdId, setThirdId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("efectivo");
  const [amount, setAmount] = useState<number>(0);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [apps, setApps] = useState<AppLine[]>([]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts-tx", companyId],
    queryFn: async () => {
      const { data } = await sb.from("bank_accounts").select("id, name, current_balance")
        .eq("company_id", companyId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const { data: thirds } = useQuery({
    queryKey: ["thirds-tx", companyId, type],
    queryFn: async () => {
      const kinds = type === "cobro" ? ["cliente", "ambos"] : type === "pago" ? ["proveedor", "ambos"] : [];
      let q = sb.from("third_parties").select("id, legal_name, trade_name").eq("company_id", companyId);
      if (kinds.length) q = q.in("kind", kinds);
      const { data } = await q.order("legal_name");
      return data ?? [];
    },
  });

  // Load pending AR/AP for selected third
  const { data: docs } = useQuery({
    queryKey: ["pending-docs", companyId, type, thirdId],
    enabled: !!thirdId && (type === "cobro" || type === "pago"),
    queryFn: async () => {
      const table = type === "cobro" ? "accounts_receivable" : "accounts_payable";
      const field = type === "cobro" ? "customer_id" : "supplier_id";
      const { data } = await sb.from(table)
        .select("id, doc_number, balance, invoice_date, due_date, total_amount")
        .eq("company_id", companyId).eq(field, thirdId)
        .in("status", ["pendiente", "parcial"])
        .order("invoice_date");
      return data ?? [];
    },
  });

  const appliedTotal = useMemo(() => apps.reduce((s, a) => s + a.amount, 0), [apps]);
  const unassigned = amount - appliedTotal;

  function toggleDoc(d: any) {
    setApps((cur) => {
      const idx = cur.findIndex((x) => x.doc_id === d.id);
      if (idx >= 0) return cur.filter((_, i) => i !== idx);
      const bal = Number(d.balance);
      return [...cur, { doc_id: d.id, doc_number: d.doc_number, balance: bal, amount: bal }];
    });
  }

  const save = useMutation({
    mutationFn: async ({ confirm }: { confirm: boolean }) => {
      if (!accountId) throw new Error("Selecciona la cuenta");
      if (amount <= 0) throw new Error("Ingresa el monto");
      if (type === "transferencia" && !accountToId) throw new Error("Cuenta destino requerida");
      if ((type === "cobro" || type === "pago") && !thirdId) throw new Error("Selecciona el tercero");
      if (appliedTotal > amount) throw new Error("Aplicaciones exceden el monto");

      const { data: doc } = await sb.rpc("next_treasury_number", { _company_id: companyId, _type: type });
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tx, error: e1 } = await sb.from("treasury_transactions").insert({
        company_id: companyId, doc_number: doc, txn_type: type,
        bank_account_id: accountId,
        bank_account_to_id: type === "transferencia" ? accountToId : null,
        third_party_id: (type === "cobro" || type === "pago") ? thirdId : null,
        txn_date: date, payment_method: method, amount,
        reference: reference || null, notes: notes || null,
        status: "borrador", created_by: user?.id,
      }).select("id").single();
      if (e1) throw e1;

      if (apps.length > 0) {
        const payload = apps.map((a) => ({
          treasury_txn_id: tx.id,
          ar_id: type === "cobro" ? a.doc_id : null,
          ap_id: type === "pago" ? a.doc_id : null,
          amount: a.amount,
        }));
        const { error: e2 } = await sb.from("payment_applications").insert(payload);
        if (e2) throw e2;
      }

      if (confirm) {
        const { error: e3 } = await sb.rpc("confirm_treasury_transaction", { _txn_id: tx.id });
        if (e3) throw e3;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-txns", companyId] });
      qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable", companyId] });
      qc.invalidateQueries({ queryKey: ["accounts-payable", companyId] });
      toast.success("Movimiento guardado");
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const showApps = (type === "cobro" || type === "pago") && !!thirdId;

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>Nuevo movimiento de tesorería</DialogTitle></DialogHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(["cobro", "pago", "transferencia", "ajuste_positivo", "ajuste_negativo"] as TxnType[]).map((t) => {
            const Icon = TXN_ICON[t];
            return (
              <button
                key={t}
                onClick={() => { setType(t); setApps([]); setThirdId(""); }}
                className={
                  "rounded-lg border p-2.5 flex flex-col items-center gap-1 text-xs transition " +
                  (type === t ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40")
                }
              >
                <Icon className="size-4" /> {TXN_LABEL[t]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>{type === "transferencia" ? "Cuenta origen *" : "Cuenta *"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} — $ {fmt(a.current_balance)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "transferencia" && (
            <div>
              <Label>Cuenta destino *</Label>
              <Select value={accountToId} onValueChange={setAccountToId}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).filter((a: any) => a.id !== accountId).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(type === "cobro" || type === "pago") && (
            <div>
              <Label>{type === "cobro" ? "Cliente *" : "Proveedor *"}</Label>
              <Select value={thirdId} onValueChange={(v) => { setThirdId(v); setApps([]); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {(thirds ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.trade_name ?? c.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto *</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="md:col-span-2">
            <Label>Referencia</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº comprobante, cheque, transacción" />
          </div>
        </div>

        {showApps && (
          <div className="rounded-lg border border-border">
            <div className="p-3 border-b border-border flex items-center justify-between text-sm">
              <span className="font-medium">Aplicar a documentos pendientes</span>
              <span className={unassigned < 0 ? "text-destructive" : "text-muted-foreground"}>
                Sin asignar: $ {fmt(unassigned)}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">A aplicar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">Sin documentos pendientes.</TableCell></TableRow>
                )}
                {(docs ?? []).map((d: any) => {
                  const app = apps.find((a) => a.doc_id === d.id);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <input type="checkbox" checked={!!app} onChange={() => toggleDoc(d)} className="size-4 accent-primary" />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                      <TableCell className="text-right">$ {fmt(d.balance)}</TableCell>
                      <TableCell className="text-right">
                        {app ? (
                          <Input
                            type="number" min={0} max={Number(d.balance)} step="0.01"
                            value={app.amount}
                            onChange={(e) => setApps((cur) => cur.map((x) => x.doc_id === d.id ? { ...x, amount: Math.min(Number(e.target.value), Number(d.balance)) } : x))}
                            className="w-32 h-8 text-right ml-auto"
                          />
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div>
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ confirm: false })}>Guardar borrador</Button>
        <Button disabled={save.isPending} onClick={() => save.mutate({ confirm: true })}>
          <CheckCircle2 className="size-4 mr-1" /> Confirmar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
