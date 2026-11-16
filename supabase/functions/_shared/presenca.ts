// supabase/functions/_shared/presenca.ts
//
// Resposta do passageiro ao "você confirma a viagem?" (issue #434). Só age quando a equipe pediu a
// confirmação pelo app (aviso tipo "confirmacao" enviado nas últimas 36 h) e a resposta é um SIM ou
// NÃO claro (respostaDePresenca). Registra na reserva (fn_registrar_presenca: NÃO abre pendência
// para a equipe liberar a vaga — o bot nunca cancela) e responde só um obrigado curto.

import { respostaDePresenca } from "./avisoPuro.ts";
import { chatwootClient } from "./chatwootClient.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { variantesTelefone } from "./telefone.ts";

const evento = (nome: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento: nome, ...dados }));

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

/** true = a mensagem era a resposta da confirmação e foi tratada (o bot não precisa responder mais nada). */
export async function registrarPresencaSePedida(p: {
  telefone: string;
  texto: string;
  chatwootConversationId: number;
}): Promise<boolean> {
  const resposta = respostaDePresenca(p.texto);
  if (!resposta) return false;
  const variantes = variantesTelefone(p.telefone);
  if (!variantes.length) return false;
  const desde = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  // 1) as reservas ativas desse telefone ainda sem resposta
  const { data: clientes } = await supabaseAdmin.from("customers").select("id").in("phone", variantes).is("deleted_at", null);
  const idsClientes = ((clientes ?? []) as Linha[]).map((c) => c.id);
  if (!idsClientes.length) return false;
  const { data: reservas } = await supabaseAdmin
    .from("reservations")
    .select("id, status, extra_data")
    .in("customer_id", idsClientes)
    .in("status", ["confirmada", "pendente"])
    .is("deleted_at", null);
  const semResposta = ((reservas ?? []) as Linha[]).filter((r) => !r.extra_data?.presenca).map((r) => String(r.id));
  if (!semResposta.length) return false;
  // 2) quais delas receberam o pedido de confirmação nas últimas 36 h
  const { data: pedidos } = await supabaseAdmin
    .from("avisos_passageiros")
    .select("reservation_id")
    .eq("tipo", "confirmacao")
    .eq("status", "enviado")
    .gte("criado_em", desde)
    .in("reservation_id", semResposta);
  const abertas = (pedidos ?? []) as Linha[];
  if (!abertas.length) return false;
  const ids = [...new Set(abertas.map((a) => String(a.reservation_id)))];
  for (const id of ids) {
    await supabaseAdmin.rpc("fn_registrar_presenca", { p_reservation_id: id, p_resposta: resposta, p_texto: p.texto });
  }
  const obrigado = resposta === "sim"
    ? "Obrigado por confirmar! Sua vaga está garantida. ✅"
    : "Tudo bem, obrigado por avisar! Vou passar para a equipe liberar a sua vaga. Se mudar de ideia, é só responder aqui.";
  await chatwootClient.postMessage(p.chatwootConversationId, obrigado).catch((e) =>
    evento("bot_aviso", { aviso: "obrigado_presenca_nao_enviado", erro: String(e).slice(0, 200) })
  );
  evento("bot_presenca_respondida", { conversa: p.chatwootConversationId, resposta, reservas: ids.length });
  return true;
}
