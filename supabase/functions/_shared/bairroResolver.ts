// supabase/functions/_shared/bairroResolver.ts
//
// Em que bairro fica um endereço que não está na tabela de preços (issue #270)?
// O cliente costuma citar o condomínio/residencial ("Residencial Colinas") em
// vez do bairro, e a busca em casa é cobrada pelo bairro. Ordem:
//   1) a memória de endereços (bairro_aliases: confirmados pela equipe/dono ou já
//      descobertos antes) — sem custo;
//   2) pesquisa na internet com a ferramenta web_search da API do Claude, que só
//      pode responder um bairro da tabela de preços. O achado vai para a memória
//      como fonte 'internet', a conferir.
// Nada aqui inventa preço: o valor continua sendo o do bairro na tabela.
// Melhor esforço: falha aqui nunca derruba o atendimento.

import { bairroDaTabela, bairroPorApelido } from "./agentePuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

const MODELO = Deno.env.get("BOT_BAIRRO_MODELO") ?? "claude-sonnet-5-5";

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

export type BairroDeduzido = { bairro: string; fonte: "memoria" | "internet"; evidencia: string | null };

// biome-ignore lint/suspicious/noExplicitAny: resposta externa da API
type Bloco = Record<string, any>;

type Achado = { bairro: string; lugar: string | null; evidencia: string };

async function pesquisarNaInternet(texto: string, bairros: string[]): Promise<Achado | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  const ferramenta = {
    name: "registrar_bairro",
    description: "Registra em qual bairro da lista fica o endereço, ou 'nenhum' se não der para saber com segurança.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        bairro: { type: "string", enum: [...bairros, "nenhum"] },
        lugar: {
          type: "string",
          description: "Só o nome do lugar pesquisado, sem rua nem número (ex.: 'Residencial Colinas'), ou vazio se for só uma rua.",
        },
        evidencia: { type: "string", description: "Em uma frase: o que a pesquisa mostrou e a fonte." },
      },
      required: ["bairro", "lugar", "evidencia"],
      additionalProperties: false,
    },
  };
  const messages: Bloco[] = [
    {
      role: "user",
      content: `Em qual bairro de São Luís (Maranhão) fica este endereço: "${texto}"?\n\nPesquise na internet (condomínio, residencial, conjunto, rua ou ponto de referência). Depois chame registrar_bairro com um bairro da lista abaixo, ou "nenhum" se não tiver segurança. Não chute.\n\nBAIRROS: ${bairros.join(", ")}`,
    },
  ];
  for (let volta = 0; volta < 3; volta++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4000,
        output_config: { effort: "low" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 3,
            user_location: { type: "approximate", city: "São Luís", region: "Maranhão", country: "BR", timezone: "America/Fortaleza" },
          },
          ferramenta,
        ],
        tool_choice: { type: "auto" },
        messages,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Falha na pesquisa do bairro: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const corpo = await res.json();
    const uso = (corpo.content ?? []).find((b: Bloco) => b.type === "tool_use" && b.name === "registrar_bairro");
    if (uso) {
      const bairro = String(uso.input?.bairro ?? "");
      if (!bairro || bairro === "nenhum" || !bairros.includes(bairro)) return null;
      const lugar = String(uso.input?.lugar ?? "").trim().slice(0, 120) || null;
      return { bairro, lugar, evidencia: String(uso.input?.evidencia ?? "").slice(0, 300) };
    }
    // a pesquisa no servidor parou no meio (pause_turn): reenvia para continuar
    if (corpo.stop_reason !== "pause_turn") return null;
    messages.push({ role: "assistant", content: corpo.content });
  }
  return null;
}

/**
 * Bairro da tabela para um endereço que não bate com nenhum bairro dela.
 * `texto`: o que o cliente disse (residencial, condomínio, rua…).
 */
export async function resolverBairro(texto: string | null | undefined, conversa?: number): Promise<BairroDeduzido | null> {
  const t = String(texto ?? "").trim();
  if (t.length < 4) return null;
  try {
    const [{ data: tabela }, { data: apelidos }] = await Promise.all([
      supabaseAdmin.from("neighborhood_pricing").select("neighborhood").order("neighborhood"),
      supabaseAdmin.from("bairro_aliases").select("apelido, bairro, confirmado"),
    ]);
    const bairros = (tabela ?? []).map((b: Bloco) => String(b.neighborhood));
    if (bairroDaTabela(t, tabela ?? [])) return null; // já é um bairro da tabela: quem chamou resolve

    const daMemoria = bairroPorApelido(t, apelidos ?? []);
    if (daMemoria && bairros.includes(daMemoria)) {
      evento("bot_bairro_deduzido", { conversa: conversa ?? null, fonte: "memoria", bairro: daMemoria });
      return { bairro: daMemoria, fonte: "memoria", evidencia: null };
    }

    const achado = await pesquisarNaInternet(t, bairros);
    evento("bot_bairro_deduzido", { conversa: conversa ?? null, fonte: "internet", bairro: achado?.bairro ?? null });
    if (!achado) return null;
    // guarda o lugar descoberto (a conferir), para não pesquisar de novo; rua solta não vira memória
    if (achado.lugar && achado.lugar.length >= 4) {
      const { error } = await supabaseAdmin.from("bairro_aliases").insert({
        apelido: achado.lugar,
        bairro: achado.bairro,
        fonte: "internet",
        confirmado: false,
        evidencia: achado.evidencia,
      });
      if (error && !/duplicate key/.test(error.message)) {
        evento("bot_aviso", { aviso: "bairro_nao_memorizado", erro: error.message.slice(0, 200) });
      }
    }
    return { bairro: achado.bairro, fonte: "internet", evidencia: achado.evidencia };
  } catch (err) {
    evento("bot_aviso", { aviso: "bairro_nao_resolvido", conversa: conversa ?? null, erro: String(err).slice(0, 300) });
    return null;
  }
}

/** Texto do aviso que vai para o "Conferir" do rascunho. */
export function avisoDoBairro(original: string, d: BairroDeduzido): string {
  return d.fonte === "memoria"
    ? `Bairro pela memória de endereços: ${original} fica no ${d.bairro}.`
    : `Bairro deduzido pela internet: ${original} fica no ${d.bairro}. Confira.`;
}
