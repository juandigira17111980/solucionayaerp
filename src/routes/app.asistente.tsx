import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, User, Wrench, Bot, Loader2 } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/hooks/use-active-company";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/asistente")({ component: AsistentePage });

type Agent = "general" | "contable" | "comercial";

const AGENTS: { id: Agent; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Preguntas transversales sobre tu ERP." },
  { id: "contable", label: "Contable", description: "P&G, cartera, cuentas por pagar, gastos, nómina." },
  { id: "comercial", label: "Comercial", description: "Ventas, POS, clientes, inventario, reposición." },
];

const SUGGESTIONS: Record<Agent, string[]> = {
  general: [
    "Dame un resumen ejecutivo de esta semana",
    "¿Qué alertas críticas tengo hoy?",
    "¿Qué productos necesito reponer?",
  ],
  contable: [
    "P&G del mes actual",
    "Muéstrame la cartera vencida",
    "¿Qué facturas de proveedor vencen esta semana?",
  ],
  comercial: [
    "Ventas de los últimos 30 días",
    "Top productos a reponer",
    "Valor total del inventario por bodega",
  ],
};

function AsistentePage() {
  const { activeCompanyId, activeCompany, isLoading } = useActiveCompany();
  const [agent, setAgent] = useState<Agent>("general");
  const [token, setToken] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setToken(s?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  if (!activeCompanyId) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Sin empresa activa"
        description="Selecciona o crea una empresa para conversar con el asistente."
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        eyebrow="IA"
        title="Asistente IA"
        description={`Consulta datos reales de ${activeCompany?.trade_name ?? activeCompany?.legal_name ?? "tu empresa"} en lenguaje natural.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setChatKey((k) => k + 1)}>
            Nueva conversación
          </Button>
        }
      />

      <Tabs value={agent} onValueChange={(v) => { setAgent(v as Agent); setChatKey((k) => k + 1); }}>
        <TabsList>
          {AGENTS.map((a) => (
            <TabsTrigger key={a.id} value={a.id}>{a.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {token ? (
        <ChatPanel
          key={`${chatKey}-${agent}-${activeCompanyId}`}
          companyId={activeCompanyId}
          agent={agent}
          token={token}
          suggestions={SUGGESTIONS[agent]}
        />
      ) : (
        <div className="mt-6 text-sm text-muted-foreground">Preparando sesión…</div>
      )}
    </div>
  );
}

function ChatPanel({
  companyId, agent, token, suggestions,
}: { companyId: string; agent: Agent; token: string; suggestions: string[] }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${token}` },
        body: { companyId, agent },
      }),
    [companyId, agent, token],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { inputRef.current?.focus(); }, [status]);

  const disabled = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const value = text.trim();
    if (!value || disabled) return;
    sendMessage({ text: value });
    setInput("");
  }

  return (
    <div className="mt-4 flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl text-center py-10">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-6" />
            </div>
            <h3 className="mt-4 font-semibold">¿En qué te ayudo hoy?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Puedo consultar ventas, cartera, inventario, gastos y más.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Pensando…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error.message || "Ocurrió un error consultando el asistente."}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="flex items-end gap-2 border-t border-border bg-surface/60 p-3"
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
          }}
          placeholder="Pregúntame sobre tu negocio…"
          rows={1}
          className="min-h-[44px] max-h-40 resize-none"
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !input.trim()} size="icon">
          {disabled ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
  const toolParts = message.parts.filter((p) => p.type.startsWith("tool-"));

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("max-w-[85%] space-y-2", isUser && "text-right")}>
        {toolParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolParts.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Wrench className="size-3" /> {p.type.replace("tool-", "")}
              </span>
            ))}
          </div>
        )}
        {text && (
          <div
            className={cn(
              "inline-block rounded-2xl px-4 py-2.5 text-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-foreground",
            )}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
