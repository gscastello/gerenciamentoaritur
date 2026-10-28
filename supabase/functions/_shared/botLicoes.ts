// supabase/functions/_shared/botLicoes.ts
//
// Lições aprendidas no modo sombra que JÁ VALEM (status 'ativa'), prontas para
// entrar nos prompts do bot. Cache curto: o isolate atende várias conversas e
// as lições mudam devagar. Falha de leitura nunca derruba uma resposta.

import { blocoDeLicoes, type LicaoGuardada, type TipoLicao } from "./aprendizado.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

const CACHE_MS = 5 * 60 * 1000;
let cache: { em: number; licoes: LicaoGuardada[] } | null = null;

export async function licoesAtivas(): Promise<LicaoGuardada[]> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.licoes;
  try {
    const { data, error } = await supabaseAdmin
      .from("bot_learnings")
      .select("id, kind, title, content, evidence_count")
      .eq("status", "ativa")
      .order("evidence_count", { ascending: false })
      .limit(80);
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
