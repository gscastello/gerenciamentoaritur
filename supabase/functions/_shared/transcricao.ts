// supabase/functions/_shared/transcricao.ts
//
// Transcrição de áudio feita pelo próprio bot (issue #482). O Claude não ouve áudio, e o Chatwoot
// só transcreve enquanto há crédito do Captain (acabou em 22/11 às 13 h e o bot ficou surdo). Aqui o
// áudio é baixado do Chatwoot e transcrito na OpenAI (`gpt-4o-mini-transcribe`, ~US$ 0,003/min).
// Só liga com o secret OPENAI_API_KEY. Falha aqui nunca derruba o atendimento: devolve null.

import { comTranscricoesDoBot } from "./chatwootPayload.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { contextoDaTranscricao } from "./transcricaoPura.ts";

const MODELO = Deno.env.get("TRANSCRICAO_MODELO") ?? "gpt-4o-mini-transcribe";
/** Ruas conhecidas (mapa, ou citadas em 2+ reservas: o que veio de um áudio só não entra), guardadas 1 h. */
let vocabulario: { em: number; texto: string } | null = null;
async function contexto(): Promise<string> {
  if (vocabulario && Date.now() - vocabulario.em < 3600_000) return vocabulario.texto;
  const { data } = await supabaseAdmin
    .from("cidade_lugares")
    .select("nome")
    .eq("tipo", "rua")
    .or("fonte.eq.mapa,ocorrencias.gte.2")
    .order("ocorrencias", { ascending: false })
    .order("nome")
    .limit(80);
  const texto = contextoDaTranscricao(((data ?? []) as { nome: string }[]).map((l) => l.nome));
  if (data?.length) vocabulario = { em: Date.now(), texto };
  return texto;
}

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

/** O bot consegue transcrever sozinho? (o secret está cadastrado) */
export function transcricaoPropriaLigada(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
}

const EXTENSAO: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/** Só baixa arquivo do próprio Chatwoot (o anexo vem de lá). */
export function urlDoChatwoot(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "chatwoot.com" || u.hostname.endsWith(".chatwoot.com"));
  } catch {
    return false;
  }
}

/** Manda o arquivo para a OpenAI e devolve o texto (lança em falha). */
async function transcreverNaOpenAI(arquivo: Blob, mime: string, chave: string): Promise<string> {
  const form = new FormData();
  form.append("file", new File([arquivo], `audio.${EXTENSAO[mime] ?? "ogg"}`, { type: mime }));
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("prompt", await contexto());
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`openai ${res.status} ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json();
  return String(corpo?.text ?? "").replace(/\s+/g, " ").trim();
}

/** Fala gravada no app (Assistente e anotação por voz — issue #516): com as ruas conhecidas no vocabulário. */
export async function transcreverFala(arquivo: Blob, tipo: string | null): Promise<string | null> {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave) return null;
  const inicio = Date.now();
  try {
    const mime = (tipo || arquivo.type || "audio/webm").split(";")[0].trim().toLowerCase();
    const texto = await transcreverNaOpenAI(arquivo, mime, chave);
    evento("assistente_fala_transcrita", { ms: Date.now() - inicio, bytes: arquivo.size, letras: texto.length, modelo: MODELO });
    return texto || null;
  } catch (err) {
    evento("bot_erro", { etapa: "fala_do_app", erro: String(err).slice(0, 300) });
    return null;
  }
}

/** Baixa o áudio e transcreve. null se não deu (sem chave, falha do download ou da OpenAI). */
export async function transcreverAudio(url: string, tipo: string | null, conversa?: number): Promise<string | null> {
  const chave = Deno.env.get("OPENAI_API_KEY");
  if (!chave || !urlDoChatwoot(url)) return null;
  const inicio = Date.now();
  try {
    const baixado = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!baixado.ok) throw new Error(`download ${baixado.status}`);
    const arquivo = await baixado.blob();
    const mime = (tipo || arquivo.type || "audio/ogg").split(";")[0].trim().toLowerCase();
    const texto = await transcreverNaOpenAI(arquivo, mime, chave);
    evento("bot_audio_transcrito_pelo_bot", { conversa, ms: Date.now() - inicio, bytes: arquivo.size, letras: texto.length, modelo: MODELO });
    return texto || null;
  } catch (err) {
    evento("bot_erro", { etapa: "transcricao_propria", conversa, erro: String(err).slice(0, 300) });
    return null;
  }
}

/**
 * As mensagens lidas do Chatwoot com a transcrição que o bot guardou nas observações (o Chatwoot
 * segue mostrando o áudio vazio). Usada por quem lê a conversa pela API do Chatwoot: a leitura do
 * Agendado, a simulação (avaliação/sentinela) e o atendente.
 */
// deno-lint-ignore no-explicit-any
export async function mensagensComTranscricoesDoBot<T extends Record<string, any>>(brutas: T[]): Promise<T[]> {
  const ids = (brutas ?? [])
    .filter((m) => Array.isArray(m?.attachments) && m.attachments.some((a: { file_type?: string; transcribed_text?: string }) =>
      a?.file_type === "audio" && !String(a.transcribed_text ?? "").trim()
    ))
    .map((m) => Number(m.id))
    .filter((id) => Number.isFinite(id));
  if (!ids.length) return brutas;
  const { data } = await supabaseAdmin
    .from("bot_observations")
    .select("chatwoot_message_id, content")
    .in("chatwoot_message_id", ids)
    .like("content", "%[áudio:%");
  const mapa = new Map<number, string>(((data ?? []) as { chatwoot_message_id: number; content: string }[]).map((o) => [Number(o.chatwoot_message_id), String(o.content)]));
  return comTranscricoesDoBot(brutas, mapa);
}

/**
 * Transcreve os áudios de uma conversa que ficaram sem texto (os que chegaram enquanto o Chatwoot não
 * transcrevia). Troca a observação no lugar, como a transcrição do Chatwoot faria. Devolve o que fez.
 */
export async function transcreverAudiosAntigos(
  chatwootConversationId: number,
  // deno-lint-ignore no-explicit-any
  listar: (cw: number) => Promise<Record<string, any>[]>,
  textoFinal: (conteudo: string | undefined, anexos: unknown) => string | undefined,
  audiosSemTexto: (anexos: unknown) => { indice: number; url: string; tipo: string | null }[],
  anexosComTranscricao: (anexos: unknown, textos: Map<number, string>) => unknown,
): Promise<{ mensagem: number; texto: string }[]> {
  const feitas: { mensagem: number; texto: string }[] = [];
  for (const m of await listar(chatwootConversationId)) {
    const audios = audiosSemTexto(m.attachments);
    if (!audios.length || m.private) continue;
    const { data: obs } = await supabaseAdmin
      .from("bot_observations")
      .select("id, content")
      .eq("chatwoot_message_id", Number(m.id))
      .maybeSingle();
    if (!obs || !String(obs.content ?? "").includes("[áudio sem transcrição")) continue;
    const textos = new Map<number, string>();
    for (const a of audios) {
      const t = await transcreverAudio(a.url, a.tipo, chatwootConversationId);
      if (t) textos.set(a.indice, t);
    }
    if (!textos.size) continue;
    const novo = textoFinal(typeof m.content === "string" ? m.content : undefined, anexosComTranscricao(m.attachments, textos));
    if (!novo) continue;
    await supabaseAdmin.from("bot_observations").update({ content: novo }).eq("id", obs.id);
    feitas.push({ mensagem: Number(m.id), texto: novo });
  }
  return feitas;
}
