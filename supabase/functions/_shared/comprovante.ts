// supabase/functions/_shared/comprovante.ts
//
// Comprovante Pix mandado no WhatsApp (issue #363). Baixa a imagem do Chatwoot,
// pede ao Claude que LEIA (valor, data, quem pagou, quem recebeu, id da
// transação), decide com comprovantePuro.ts e:
//   * tudo bate → rpc_baixa_por_comprovante (o banco confere valor e repetido de
//     novo) e a reserva fica paga, com o comprovante anexado;
//   * qualquer dúvida → pendência para a equipe, com o motivo;
//   * não é comprovante → nada.
// É trabalho de escritório, não conversa: vale em qualquer modo (ia, manual,
// sombra). Quem fala com o cliente é o conversationEngine, só no modo ia.

import { hojeSaoLuis } from "./dataOperacao.ts";
import {
  decidirComprovante,
  FERRAMENTA_DO_COMPROVANTE,
  instrucoesDoComprovante,
  type LeituraDoComprovante,
  normalizarComprovante,
  type ReservaParaBaixa,
} from "./comprovantePuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { variantesTelefone } from "./telefone.ts";
import { whatsappClient } from "./whatsappClient.ts";

const MODELO = Deno.env.get("BOT_COMPROVANTE_MODELO") ?? "claude-haiku-5-5";
const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const TAMANHO_MAXIMO = 4_500_000;

export type ResultadoDoComprovante =
  | { resultado: "baixa"; leitura: LeituraDoComprovante; reservas: ReservaParaBaixa[] }
  | { resultado: "pendencia"; motivo: string }
  | { resultado: "nao_e_comprovante" }
  | { resultado: "nao_lido"; motivo: string };

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function lerComOModelo(bytes: Uint8Array, tipo: string, hoje: string): Promise<LeituraDoComprovante> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const anexo = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(bytes) } }
    : { type: "image", source: { type: "base64", media_type: tipo, data: base64(bytes) } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 800,
      system: instrucoesDoComprovante(hoje),
      tools: [FERRAMENTA_DO_COMPROVANTE],
      tool_choice: { type: "tool", name: FERRAMENTA_DO_COMPROVANTE.name },
      messages: [{ role: "user", content: [anexo, { type: "text", text: "Registre o que está nesta imagem." }] }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const r = await res.json();
  evento("bot_comprovante_lido", { entrada: r.usage?.input_tokens ?? null, saida: r.usage?.output_tokens ?? null });
  // biome-ignore lint/suspicious/noExplicitAny: blocos da API
  const bloco = (r.content ?? []).find((c: any) => c.type === "tool_use");
  return normalizarComprovante(bloco?.input ?? null, hoje);
}

/** Reservas do cliente que um comprovante pode pagar (de 15 dias atrás em diante). */
async function reservasDoCliente(customerId: string, hoje: string): Promise<ReservaParaBaixa[]> {
  const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - 15 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("id, status, total_price, trips!inner(trip_date, direction), payments(status, deleted_at)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .gte("trips.trip_date", desde);
  // biome-ignore lint/suspicious/noExplicitAny: linhas do banco
  return ((data ?? []) as any[]).map((x) => ({
    id: x.id,
    data: x.trips.trip_date,
    direcao: x.trips.direction,
    total: Number(x.total_price ?? 0),
    status: x.status,
    // biome-ignore lint/suspicious/noExplicitAny: linhas do banco
    pago: (x.payments ?? []).some((p: any) => !p.deleted_at && p.status === "pago"),
  }));
}

async function clienteDoTelefone(telefone: string): Promise<string | null> {
  const formas = variantesTelefone(telefone).join(",");
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id")
    .or(`phone.in.(${formas}),phone_secondary.in.(${formas})`)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

const MOTIVOS_DO_BANCO: Record<string, string> = {
  repetido: "Esse comprovante já foi usado em outra baixa.",
  ja_pago: "A reserva já estava paga.",
  valor_diferente: "O valor não bate com o total da reserva.",
  reserva_invalida: "A reserva mudou (cancelada ou apagada) antes da baixa.",
};

export async function processarComprovante(e: {
  telefone: string;
  mediaUrl: string;
  waMessageId: string;
  conversationId: string;
}): Promise<ResultadoDoComprovante> {
  const hoje = hojeSaoLuis();
  const { bytes, mimeType } = await whatsappClient.downloadMedia(e.mediaUrl);
  const tipo = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (!IMAGENS.includes(tipo) && tipo !== "application/pdf") return { resultado: "nao_lido", motivo: `arquivo ${tipo || "sem tipo"}` };
  if (bytes.length > TAMANHO_MAXIMO) return { resultado: "nao_lido", motivo: "arquivo grande demais" };

  const leitura = await lerComOModelo(bytes, tipo, hoje);
  if (!leitura.eh_comprovante) return { resultado: "nao_e_comprovante" };

  const [customerId, { data: cfg }] = await Promise.all([
    clienteDoTelefone(e.telefone),
    supabaseAdmin.from("settings").select("value").eq("key", "pix").maybeSingle(),
  ]);
  const reservas = customerId ? await reservasDoCliente(customerId, hoje) : null;
  const decisao = decidirComprovante(leitura, { hoje, pix: (cfg?.value ?? {}) as { key?: string; name?: string }, reservas });

  // guarda o arquivo (ligado à 1ª reserva da baixa, ou em "conferir/")
  const ext = tipo === "application/pdf" ? "pdf" : tipo.split("/")[1] ?? "jpg";
  const pasta = decisao.tipo === "baixa" ? decisao.reservas[0].id : "conferir";
  const arquivo = `${pasta}/${e.waMessageId}.${ext}`;
  const { error: erroArquivo } = await supabaseAdmin.storage
    .from("payment-proofs")
    .upload(arquivo, bytes, { contentType: tipo, upsert: true });
  if (erroArquivo) evento("bot_aviso", { aviso: "comprovante_nao_guardado", erro: erroArquivo.message.slice(0, 200) });

  if (decisao.tipo === "baixa") {
    const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
    const { data: r, error } = await supabaseAdmin.rpc("rpc_baixa_por_comprovante", {
      p_reservas: decisao.reservas.map((x) => x.id),
      p_valor: leitura.valor,
      p_arquivo: erroArquivo ? null : arquivo,
      p_txid: leitura.txid,
      p_leitura: leitura,
      p_customer_id: customerId,
      p_conversation_id: e.conversationId,
      p_actor: bot?.id ?? null,
    });
    if (!error && r?.success) {
      evento("bot_comprovante_baixa", { reservas: decisao.reservas.length, valor: leitura.valor });
      return { resultado: "baixa", leitura, reservas: decisao.reservas };
    }
    const motivo = MOTIVOS_DO_BANCO[r?.motivo] ?? `Não consegui dar baixa (${error?.message ?? r?.motivo ?? "erro"}).`;
    await registrarPendencia(leitura, customerId, e.conversationId, arquivo, motivo);
    return { resultado: "pendencia", motivo };
  }

  if (decisao.tipo === "nao_e_comprovante") return { resultado: "nao_e_comprovante" };
  await registrarPendencia(leitura, customerId, e.conversationId, erroArquivo ? null : arquivo, decisao.motivo);
  return { resultado: "pendencia", motivo: decisao.motivo };
}

async function registrarPendencia(
  leitura: LeituraDoComprovante,
  customerId: string | null,
  conversationId: string,
  arquivo: string | null,
  motivo: string,
) {
  const { error } = await supabaseAdmin.from("comprovantes_pix").insert({
    txid: leitura.txid,
    valor: leitura.valor,
    arquivo,
    customer_id: customerId,
    conversation_id: conversationId,
    resultado: "pendencia",
    motivo,
    leitura,
  });
  if (error) evento("bot_aviso", { aviso: "comprovante_pendencia_nao_gravada", erro: error.message.slice(0, 200) });
  evento("bot_comprovante_pendencia", { motivo: motivo.slice(0, 120) });
}
