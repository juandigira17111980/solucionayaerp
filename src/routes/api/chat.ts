import { createFileRoute } from "@tanstack/react-router";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { messages?: unknown; companyId?: unknown; agent?: unknown };

const AGENT_PROMPTS: Record<string, string> = {
  contable:
    "Eres el asistente CONTABLE del ERP Soluciona Ya. Ayudas al usuario a entender su información financiera: P&G, cartera, cuentas por pagar, movimientos contables, gastos, nómina. Usa las herramientas para consultar datos reales de la empresa activa antes de responder. Responde en español, breve y profesional, con cifras en pesos colombianos y en formato Markdown (usa tablas cuando ayude).",
  comercial:
    "Eres el asistente COMERCIAL del ERP Soluciona Ya. Ayudas al usuario con ventas, clientes, POS, inventario disponible y sugerencias de reposición. Usa las herramientas para consultar datos reales antes de responder. Responde en español, breve y práctico, en Markdown.",
  general:
    "Eres el asistente general del ERP Soluciona Ya. Ayudas al usuario con temas contables, comerciales, de inventario, tesorería y operativos. Usa las herramientas disponibles para consultar datos reales de la empresa activa antes de responder. Responde siempre en español, en Markdown, breve y claro.",
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        const messages = Array.isArray(body.messages) ? (body.messages as UIMessage[]) : null;
        const companyId = typeof body.companyId === "string" ? body.companyId : null;
        const agent = typeof body.agent === "string" ? body.agent : "general";
        if (!messages || !companyId) {
          return new Response("messages y companyId son requeridos", { status: 400 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const authHeader = request.headers.get("Authorization") ?? "";
        const supaUrl = process.env.SUPABASE_URL!;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(supaUrl, supaKey, {
          global: { headers: { Authorization: authHeader, apikey: supaKey } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes?.user) return new Response("Unauthorized", { status: 401 });

        const { data: member } = await supabase
          .from("user_companies")
          .select("company_id")
          .eq("company_id", companyId)
          .eq("user_id", userRes.user.id)
          .maybeSingle();
        if (!member) return new Response("Forbidden", { status: 403 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rpc = supabase.rpc.bind(supabase) as any;

        const tools = {
          smart_alerts: tool({
            description:
              "Consolida alertas críticas de la empresa: cartera vencida, pagos próximos, stock crítico y saldos bancarios negativos.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await rpc("report_smart_alerts", { p_company_id: companyId });
              return error ? { error: error.message } : { data };
            },
          }),
          reorder_suggestions: tool({
            description:
              "Devuelve productos que requieren reposición con cantidad sugerida y días de stock.",
            inputSchema: z.object({ days: z.number().int().min(7).max(180).default(30) }),
            execute: async ({ days }) => {
              const { data, error } = await rpc("report_reorder_suggestions", {
                p_company_id: companyId,
                p_days: days,
              });
              return error ? { error: error.message } : { data };
            },
          }),
          sales_summary: tool({
            description: "Resumen de ventas (totales, margen, tickets) en un rango de fechas.",
            inputSchema: z.object({
              from: z.string().describe("YYYY-MM-DD"),
              to: z.string().describe("YYYY-MM-DD"),
            }),
            execute: async ({ from, to }) => {
              const { data, error } = await rpc("report_sales_summary", {
                _company_id: companyId,
                _from: from,
                _to: to,
              });
              return error ? { error: error.message } : { data };
            },
          }),
          pnl: tool({
            description: "Estado de resultados simplificado (ingresos - costo - gastos) por rango.",
            inputSchema: z.object({ from: z.string(), to: z.string() }),
            execute: async ({ from, to }) => {
              const { data, error } = await rpc("report_pnl", {
                _company_id: companyId,
                _from: from,
                _to: to,
              });
              return error ? { error: error.message } : { data };
            },
          }),
          ar_aging: tool({
            description: "Antigüedad de cartera (CxC) por buckets (corriente, 1-30, 31-60, 61-90, +90).",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await rpc("report_ar_aging", { _company_id: companyId });
              return error ? { error: error.message } : { data };
            },
          }),
          ap_aging: tool({
            description: "Antigüedad de cuentas por pagar (CxP) por buckets.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await rpc("report_ap_aging", { _company_id: companyId });
              return error ? { error: error.message } : { data };
            },
          }),
          inventory_value: tool({
            description: "Valor de inventario por bodega (costo promedio ponderado).",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await rpc("report_inventory_value", {
                _company_id: companyId,
              });
              return error ? { error: error.message } : { data };
            },
          }),
        };

        const today = new Date().toISOString().slice(0, 10);
        const system = `${AGENT_PROMPTS[agent] ?? AGENT_PROMPTS.general}\n\nFecha actual: ${today}. Cuando el usuario pida cifras, llama primero a la herramienta correcta antes de responder. No inventes datos: si una herramienta devuelve vacío, dilo.`;

        const modelMessages = await convertToModelMessages(messages);

        const result = streamText({
          model,
          system,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(8),
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
