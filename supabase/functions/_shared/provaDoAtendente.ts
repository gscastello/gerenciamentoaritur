// supabase/functions/_shared/provaDoAtendente.ts
//
// Prova do atendente de IA com conversas reais (etapa 2 do bot autônomo, issue #501). Para um caso
// de `bot_casos`, as mensagens do CLIENTE até o "Agendado ☑️" entram em turnos (provaPura); a cada
// turno o atendente (agente.ts) lê o que o cliente escreveu e o que ELE respondeu nos turnos
// anteriores, na hora do turno. NADA é enviado nem gravado: as ferramentas rodam com `ctx.prova`
// e anotam o que fariam; o contexto da conversa vai em modo sombra como segunda trava.

import { converterMensagensDoChatwoot, converterObservacoes, diaCivil, type MensagemDaConversa } from "./agentePuro.ts";
import type { AcaoDaProva } from "./provaPura.ts";
import { historicoDoTurno, turnosDoCliente } from "./provaPura.ts";
import { montarSistema, rodarAgente } from "./agente.ts";
import type { ContextoDoAgente, ProvaDoAtendente } from "./agenteFerramentas.ts";
import { runWithBotContext } from "./botContext.ts";
import { chatwootClient } from "./chatwootClient.ts";
import { mensagensComTranscricoesDoBot } from "./transcricao.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

export type TurnoDaProva = {
  em: string;
  cliente: string[];
  resposta: string | null;
  ferramentas: string[];
  silencio: boolean;
  custo_usd: number;
};

async function mensagensAte(chatwootConversationId: number, ate: number): Promise<MensagemDaConversa[]> {
  let mensagens: MensagemDaConversa[];
  try {
    mensagens = converterMensagensDoChatwoot(await mensagensComTranscricoesDoBot(await chatwootClient.listarMensagens(chatwootConversationId, 6)));
  } catch {
    const { data } = await supabaseAdmin
      .from("bot_observations")
      .select("author, content, created_at, chatwoot_message_id")
      .eq("chatwoot_conversation_id", chatwootConversationId)
      .in("author", ["cliente", "equipe"])
      .order("created_at", { ascending: false })
      .limit(120);
    mensagens = converterObservacoes(data ?? []);
  }
  return mensagens.filter((m) => Date.parse(m.em) <= ate);
}

/** Refaz a conversa do caso com o atendente de IA, sem enviar nem gravar nada. */
export async function simularAtendimento(c: {
  conversationId: string | null;
  chatwootConversationId: number;
  mensagemId: number;
  telefone: string;
  marcaEm: string;
}): Promise<{ acoes: AcaoDaProva[]; turnos: TurnoDaProva[]; ultimaResposta: string | null; custoUsd: number; tokens: Record<string, number> }> {
  const ate = Date.parse(c.marcaEm);
  const turnos = turnosDoCliente(await mensagensAte(c.chatwootConversationId, ate), ate);
  // o que valia antes da PRIMEIRA mensagem que a prova lê (o cliente pode ter sido cadastrado no meio)
  const antesDe = turnos[0]?.mensagens[0]?.em ?? c.marcaEm;
  const acoes: AcaoDaProva[] = [];
  const respostas: (string | null)[] = [];
  const saida: TurnoDaProva[] = [];
  const tokens = { entrada: 0, saida: 0, cache_lido: 0, cache_gravado: 0 };
  let custo = 0;

  await runWithBotContext(
    { chatwootConversationId: c.chatwootConversationId, conversationId: c.conversationId ?? "", shadow: true, teste: true },
    async () => {
      for (let i = 0; i < turnos.length; i++) {
        // o atendente espera uns segundos para juntar as mensagens
        const agora = new Date(Date.parse(turnos[i].em) + 20_000);
        const prova: ProvaDoAtendente = { antesDe, agora, turno: i, acoes };
        const ctx: ContextoDoAgente = {
          conversationId: c.conversationId ?? "",
          telefone: c.telefone,
          mensagemId: c.mensagemId,
          hoje: diaCivil(agora),
          escrita: { criou: false, alterou: false, cancelou: false, esperou: false },
          consultouReservas: false,
          transferiu: false,
          silencio: false,
          parar: false,
          prova,
        };
        const { system, fontes } = await montarSistema(agora, c.telefone, { antesDe });
        const r = await rodarAgente(system, fontes, historicoDoTurno(turnos, respostas, i), ctx, c.chatwootConversationId);
        const resposta = ctx.silencio ? null : r.resposta || (ctx.transferiu ? "Vou chamar alguém da equipe para te ajudar com isso. 🙋" : null);
        respostas.push(resposta);
        custo += r.custoUsd;
        tokens.entrada += r.uso.entrada;
        tokens.saida += r.uso.saida;
        tokens.cache_lido += r.uso.cacheLeitura;
        tokens.cache_gravado += r.uso.cacheEscrita;
        saida.push({
          em: turnos[i].em,
          cliente: turnos[i].mensagens.map((m) => m.texto.slice(0, 500)),
          resposta,
          ferramentas: r.ferramentasUsadas,
          silencio: ctx.silencio,
          custo_usd: r.custoUsd,
        });
        // sem resposta segura, no modo ia a conversa iria para a equipe
        if (!ctx.silencio && !r.resposta && !ctx.transferiu) {
          acoes.push({ tipo: "chamar_atendente", texto: "sem resposta segura (números ou confirmação sem base)", turno: i });
          ctx.transferiu = true;
        }
        if (ctx.transferiu) break;
      }
    },
  );

  const ultimaResposta = [...respostas].reverse().find((r) => r) ?? null;
  return { acoes, turnos: saida, ultimaResposta, custoUsd: Math.round(custo * 100000) / 100000, tokens };
}
