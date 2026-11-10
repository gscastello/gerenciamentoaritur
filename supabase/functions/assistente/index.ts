// supabase/functions/assistente/index.ts
//
// Assistente da equipe (issue #288) — aba "Assistente" do app. A pessoa logada
// (admin, atendente ou financeiro) conversa; o assistente consulta o app com as
// permissões DELA e propõe reservas, mudanças e cancelamentos. Gravar só com
// { modo: "executar", acao } — o toque em "Confirmar" no cartão.
//
// Deploy: verify_jwt = true. Secrets: ANTHROPIC_API_KEY (+ os de sempre da Supabase).
// Teto de gasto: settings.assistant_budget = { usd_mensal } (padrão US$ 20).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { conversar, executarAcao, gastoDoMes, montarContexto, registrarUso } from "../_shared/assistente.ts";
import { historicoValido } from "../_shared/assistentePuro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAPEIS = ["admin", "atendente", "financeiro"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, message: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ success: false, message: "Sem autenticação." }, 401);
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await db.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return json({ success: false, message: "Sessão inválida." }, 401);
  const { data: perfil } = await db.from("users").select("role").eq("id", userId).maybeSingle();
  const papel = String(perfil?.role ?? "");
  if (!PAPEIS.includes(papel)) return json({ success: false, message: "O assistente é para a equipe (admin, atendente ou financeiro)." }, 403);

  // biome-ignore lint/suspicious/noExplicitAny: corpo vindo do app
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "Pedido inválido." }, 400);
  }

  try {
    const ctx = await montarContexto(db, userId, papel);

    if (body?.modo === "executar") {
      const r = await executarAcao(body.acao ?? {}, ctx);
      return json({ success: r.ok, message: r.mensagem });
    }

    const historico = historicoValido(body?.mensagens);
    if (!historico.length) return json({ success: false, message: "Escreva o pedido." }, 400);
    const { gasto, teto } = await gastoDoMes();
    if (gasto >= teto) {
      evento("assistente_teto", { gasto, teto });
      return json({
        success: false,
        message: `O assistente atingiu o teto de gasto do mês (US$ ${teto}). Use a Agenda normalmente; o dono pode aumentar o teto na aba Sistema.`,
      });
    }
    const inicio = Date.now();
    const r = await conversar(historico, ctx);
    await registrarUso(userId, r.modelo, r.uso, r.custo);
    evento("assistente_pedido", { papel, modelo: r.modelo, acoes: r.acoes.length, custo: r.custo, ms: Date.now() - inicio });
    return json({ success: true, texto: r.texto, acoes: r.acoes, modelo: r.modelo });
  } catch (err) {
    evento("bot_erro", { etapa: "assistente", erro: String(err).slice(0, 300) });
    return json({ success: false, message: "O assistente não conseguiu responder agora. Tente de novo em instantes." }, 500);
  }
});
