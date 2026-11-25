// supabase/functions/_shared/piloto.ts
//
// Piloto do atendente de IA e parada automática (issue #537, database/140). Fora do piloto o bot segue no
// modo sombra. Qualquer falha ao conferir = o bot fica calado.

import { supabaseAdmin } from "./supabaseAdmin.ts";

export type ResultadoDoTurno = "respondeu" | "silencio" | "transferiu" | "sem_resposta" | "erro";

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

/** Este passageiro está no piloto, e o piloto está ligado e sem parada? */
export async function pilotoVale(telefone: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("fn_piloto_vale", { p_phone: telefone });
  if (error) evento("bot_aviso", { aviso: "piloto_nao_conferido", erro: error.message.slice(0, 200) });
  return !error && data === true;
}

/** Guarda o resultado do turno e confere se é hora de parar. Nunca derruba o atendimento. */
export async function registrarTurno(t: {
  conversationId: string;
  chatwootConversationId: number;
  resultado: ResultadoDoTurno;
  custoUsd: number;
  detalhe?: string | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("bot_agente_uso").insert({
      conversation_id: t.conversationId || null,
      chatwoot_conversation_id: t.chatwootConversationId,
      resultado: t.resultado,
      custo_usd: t.custoUsd,
      detalhe: t.detalhe ? t.detalhe.slice(0, 300) : null,
    });
    if (error) throw new Error(error.message);
    const { data: motivo } = await supabaseAdmin.rpc("fn_parada_automatica");
    if (motivo) evento("bot_piloto_parou", { motivo });
  } catch (err) {
    evento("bot_aviso", { aviso: "turno_nao_registrado", erro: String(err).slice(0, 200) });
    // sem conseguir registrar, não há parada automática: para por segurança
    await supabaseAdmin.rpc("fn_piloto_parar", { p_motivo: "não foi possível registrar o atendimento" }).then(() => {}, () => {});
  }
}

export async function executarComandoDoPiloto(comando: "parar" | "religar", quem: string): Promise<string> {
  if (comando === "parar") {
    const { data } = await supabaseAdmin.rpc("fn_piloto_parar", { p_motivo: `parado por ${quem}`, p_quem: quem });
    return data === true ? "⏸️ Atendente de IA parado. A equipe atende. Para voltar: #religar" : "O atendente de IA já estava parado ou desligado.";
  }
  const { data } = await supabaseAdmin.rpc("fn_piloto_religar", { p_quem: quem });
  return data === true ? "▶️ Atendente de IA religado para os passageiros do piloto." : "O atendente de IA não estava parado.";
}
