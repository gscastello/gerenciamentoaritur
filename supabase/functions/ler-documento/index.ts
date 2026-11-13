// supabase/functions/ler-documento/index.ts
//
// Lê a foto de uma nota, cupom ou recibo (issues #362 e #369). O app manda a
// foto (base64, já reduzida no aparelho); a função guarda no bucket privado
// `notas`, pede ao Claude que LEIA o que está escrito e devolve a leitura
// conferida (documentoPuro.ts) para a pessoa revisar e lançar. Nada é lançado
// aqui: a despesa, o abastecimento ou a manutenção só existem depois do toque
// em "Lançar" no app, com as permissões de quem está logado.
//
// Deploy: verify_jwt = true. Secrets: ANTHROPIC_API_KEY. O custo entra no mesmo
// teto do assistente (settings.assistant_budget, tabela assistente_uso).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gastoDoMes, registrarUso } from "../_shared/assistente.ts";
import { custoUsd, type Uso } from "../_shared/assistentePuro.ts";
import { hojeSaoLuis } from "../_shared/dataOperacao.ts";
import {
  FERRAMENTA_DE_LEITURA,
  imagemValida,
  instrucoesDeLeitura,
  normalizarLeitura,
  type TipoDeDocumento,
} from "../_shared/documentoPuro.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODELO = Deno.env.get("LER_DOCUMENTO_MODELO") ?? "claude-haiku-5-5";
// quem fotografa: admin e financeiro lançam despesas; o motorista, o abastecimento
const PAPEIS = ["admin", "financeiro", "motorista"];

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

const EXTENSAO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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
  if (!PAPEIS.includes(String(perfil?.role ?? ""))) {
    return json({ success: false, message: "Ler nota é para admin, financeiro ou motorista." }, 403);
  }

  // biome-ignore lint/suspicious/noExplicitAny: corpo vindo do app
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "Pedido inválido." }, 400);
  }
  const img = imagemValida(body ?? {});
  if (!img.ok) return json({ success: false, message: img.erro }, 400);
  const tipoEsperado = ["despesa", "abastecimento", "manutencao"].includes(body?.tipo) ? (body.tipo as TipoDeDocumento) : null;

  const { gasto, teto } = await gastoDoMes();
  if (gasto >= teto) {
    return json({ success: false, message: `A IA atingiu o teto de gasto do mês (US$ ${teto}). Lance à mão; o dono pode aumentar o teto na aba Sistema.` });
  }

  try {
    const hoje = hojeSaoLuis();
    // 1) guarda a foto (fica para o fechamento do mês)
    const arquivo = `${hoje.slice(0, 7)}/${crypto.randomUUID()}.${EXTENSAO[img.tipo] ?? "jpg"}`;
    const bytes = Uint8Array.from(atob(img.dados), (c) => c.charCodeAt(0));
    const { error: erroFoto } = await supabaseAdmin.storage.from("notas").upload(arquivo, bytes, { contentType: img.tipo });
    if (erroFoto) throw new Error(`foto não guardada: ${erroFoto.message}`);

    // 2) lê com o modelo
    const [{ data: cats }, { data: tipos }] = await Promise.all([
      supabaseAdmin.from("expense_categories").select("slug, label").eq("active", true).is("deleted_at", null).in("kind", ["despesa", "gestao"]),
      supabaseAdmin.from("maintenance_types").select("label").eq("active", true).order("sort_order"),
    ]);
    const ctx = {
      hoje,
      categorias: (cats ?? []) as { slug: string; label: string }[],
      tiposDeManutencao: ((tipos ?? []) as { label: string }[]).map((t) => t.label),
      tipoEsperado,
    };
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1024,
        system: instrucoesDeLeitura(ctx),
        tools: [FERRAMENTA_DE_LEITURA],
        tool_choice: { type: "tool", name: FERRAMENTA_DE_LEITURA.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: img.tipo, data: img.dados } },
              { type: "text", text: "Leia esta nota/recibo e registre." },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const resposta = await res.json();
    const uso = (resposta.usage ?? {}) as Uso;
    const custo = custoUsd(String(resposta.model ?? MODELO), uso);
    // biome-ignore lint/suspicious/noExplicitAny: blocos da API
    const bloco = (resposta.content ?? []).find((c: any) => c.type === "tool_use");
    const leitura = normalizarLeitura(bloco?.input ?? null, ctx);

    // 3) guarda a leitura; a pessoa confere e lança no app
    const { data: doc, error } = await supabaseAdmin
      .from("documentos_lidos")
      .insert({ tipo: leitura.tipo, arquivo, dados: leitura, custo_usd: custo, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(`leitura não guardada: ${error.message}`);
    await registrarUso(userId, MODELO, {
      input_tokens: Number(uso.input_tokens ?? 0),
      output_tokens: Number(uso.output_tokens ?? 0),
      cache_read_input_tokens: Number(uso.cache_read_input_tokens ?? 0),
      cache_creation_input_tokens: Number(uso.cache_creation_input_tokens ?? 0),
    }, custo);
    evento("documento_lido", { tipo: leitura.tipo, legivel: leitura.legivel, custo });
    return json({ success: true, id: doc.id, leitura });
  } catch (err) {
    evento("documento_erro", { erro: String(err).slice(0, 300) });
    return json({ success: false, message: "Não consegui ler a foto agora. Tente de novo ou lance à mão." }, 500);
  }
});
