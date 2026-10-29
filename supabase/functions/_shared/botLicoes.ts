// supabase/functions/_shared/botLicoes.ts
//
// Lições aprendidas (observando as conversas) que JÁ VALEM (status 'ativa'), prontas para
// entrar nos prompts do bot. Cache curto: o isolate atende várias conversas e
// as lições mudam devagar. Falha de leitura nunca derruba uma resposta.

import { blocoDeLicoes, blocoDoCliente, type LicaoGuardada, type TipoLicao } from "./aprendizado.ts";
import { getBotContext } from "./botContext.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { variantesTelefone } from "./telefone.ts";

const CACHE_MS = 5 * 60 * 1000;
let cache: { em: number; licoes: LicaoGuardada[] } | null = null;

export async function licoesAtivas(): Promise<LicaoGuardada[]> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.licoes;
  try {
    const { data, error } = await supabaseAdmin
      .from("bot_learnings")
      .select("id, kind, title, content, evidence_count, last_seen_at")
      .eq("status", "ativa")
      .order("last_seen_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    cache = { em: Date.now(), licoes: (data ?? []) as LicaoGuardada[] };
    return cache.licoes;
  } catch (err) {
    console.error("Falha ao ler as lições do bot:", String(err).slice(0, 200));
    return cache?.licoes ?? [];
  }
}

export async function blocoDasLicoes(tipos: TipoLicao[]): Promise<string> {
  return blocoDeLicoes(await licoesAtivas(), tipos);
}

/** Depois que o dono revisa, as lições novas passam a valer sem esperar o cache. */
export function esquecerCacheDeLicoes() {
  cache = null;
}

/**
 * O que o bot anotou do cliente desta conversa (cliente recorrente), já em
 * forma de bloco de prompt. Vazio se não há anotação ou o cliente é novo.
 */
export async function blocoDoClienteAtual(): Promise<string> {
  const ctx = getBotContext();
  if (!ctx) return "";
  try {
    const { data: conversa } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("phone, customer_id")
      .eq("id", ctx.conversationId)
      .maybeSingle();
    if (!conversa) return "";
    let clienteId: string | null = conversa.customer_id;
    if (!clienteId) {
      const formas = variantesTelefone(conversa.phone).join(",");
      const { data } = await supabaseAdmin
        .from("customers")
        .select("id")
        .or(`phone.in.(${formas}),phone_secondary.in.(${formas})`)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      clienteId = data?.id ?? null;
    }
    if (!clienteId) return "";
    const { data: nota } = await supabaseAdmin
      .from("bot_customer_notes")
      .select("notes")
      .eq("customer_id", clienteId)
      .eq("status", "ativa")
      .maybeSingle();
    return blocoDoCliente(nota?.notes);
  } catch (err) {
    console.error("Falha ao ler a anotação do cliente:", String(err).slice(0, 200));
    return "";
  }
}
