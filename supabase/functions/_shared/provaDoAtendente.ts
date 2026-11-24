// supabase/functions/_shared/provaDoAtendente.ts
//
// Prova do atendente de IA com conversas reais (etapa 2 do bot autônomo, issue #501). Para um caso
// de `bot_casos`, as mensagens do CLIENTE até o "Agendado ☑️" entram em turnos (provaPura); a cada
// turno o atendente (agente.ts) lê o que o cliente escreveu e o que ELE respondeu nos turnos
// anteriores, na hora do turno. NADA é enviado nem gravado: as ferramentas rodam com `ctx.prova`
// e anotam o que fariam; o contexto da conversa vai em modo sombra como segunda trava.

import { converterMensagensDoChatwoot, converterObservacoes, diaCivil, type MensagemDaConversa } from "./agentePuro.ts";
import type { AcaoDaProva } from "./provaPura.ts";
import { historicoDoTurno, MAX_SIM_DA_PROVA, pedeConfirmacao, SIM_DA_PROVA, turnosDoCliente } from "./provaPura.ts";
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
  /** o "sim" que a prova deu no lugar do cliente (provaPura.pedeConfirmacao) */
  sintetico?: boolean;
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
      let sims = 0;
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
          ...(turnos[i].sintetico ? { sintetico: true } : {}),
        });
        // sem resposta segura, no modo ia a conversa iria para a equipe
        if (!ctx.silencio && !r.resposta && !ctx.transferiu) {
          acoes.push({ tipo: "chamar_atendente", texto: "sem resposta segura (números ou confirmação sem base)", turno: i });
          ctx.transferiu = true;
        }
        if (ctx.transferiu) break;
        // acabou a conversa real e ele só pede a confirmação do resumo: a prova diz "sim" pelo cliente
        const criou = acoes.some((a) => a.tipo === "criar");
        if (i === turnos.length - 1 && !criou && sims < MAX_SIM_DA_PROVA && pedeConfirmacao(resposta)) {
          sims++;
          const em = new Date(Date.parse(turnos[i].em) + 60_000).toISOString();
          turnos.push({ mensagens: [{ quem: "cliente", texto: SIM_DA_PROVA, em }], em, sintetico: true });
        }
      }
    },
  );

  const ultimaResposta = [...respostas].reverse().find((r) => r) ?? null;
  return { acoes, turnos: saida, ultimaResposta, custoUsd: Math.round(custo * 100000) / 100000, tokens };
}

export type RespostaDoTurno = {
  cw: number;
  em: string;
  cliente: string[];
  equipe_respondeu: string[];
  resposta: string | null;
  silencio: boolean;
  ferramentas: string[];
  acoes: AcaoDaProva[];
  custo_usd: number;
};

/**
 * Um turno só de uma conversa real (issue #524): a conversa como ela estava (com o que a equipe respondeu
 * antes), e a resposta que o atendente daria à mensagem do cliente. Nada é enviado nem gravado.
 */
export async function responderTurno(t: { conversationId: string | null; cw: number; mensagemId: number; telefone: string }): Promise<RespostaDoTurno> {
  const todas = await mensagensAte(t.cw, Date.now());
  const i = todas.findIndex((m) => m.id === t.mensagemId);
  if (i < 0) throw new Error("mensagem não encontrada na conversa");
  // o atendente junta as mensagens seguidas do cliente antes de responder
  let fim = i;
  while (todas[fim + 1]?.quem === "cliente" && Date.parse(todas[fim + 1].em) - Date.parse(todas[fim].em) <= 60_000) fim++;
  let inicio = i;
  while (inicio > 0 && todas[inicio - 1].quem === "cliente" && Date.parse(todas[inicio].em) - Date.parse(todas[inicio - 1].em) <= 180_000) inicio--;
  const em = todas[fim].em;
  const agora = new Date(Date.parse(em) + 20_000);
  const historico = todas.slice(0, fim + 1);
  const equipe: string[] = [];
  for (const m of todas.slice(fim + 1)) {
    if (m.quem === "cliente" && equipe.length) break;
    if (m.quem !== "cliente" && Date.parse(m.em) - Date.parse(em) <= 60 * 60_000) equipe.push(m.texto.slice(0, 200));
  }
  const acoes: AcaoDaProva[] = [];
  const prova: ProvaDoAtendente = { antesDe: em, agora, turno: 0, acoes };
  const ctx: ContextoDoAgente = {
    conversationId: t.conversationId ?? "",
    telefone: t.telefone,
    mensagemId: t.mensagemId,
    hoje: diaCivil(agora),
    escrita: { criou: false, alterou: false, cancelou: false, esperou: false },
    consultouReservas: false,
    transferiu: false,
    silencio: false,
    parar: false,
    prova,
  };
  return await runWithBotContext({ chatwootConversationId: t.cw, conversationId: t.conversationId ?? "", shadow: true, teste: true }, async () => {
    const { system, fontes } = await montarSistema(agora, t.telefone, { antesDe: em });
    const r = await rodarAgente(system, fontes, historico, ctx, t.cw);
    return {
      cw: t.cw,
      em,
      cliente: todas.slice(inicio, fim + 1).map((m) => m.texto.slice(0, 300)),
      equipe_respondeu: equipe.slice(0, 5),
      resposta: ctx.silencio ? null : r.resposta || null,
      silencio: ctx.silencio,
      ferramentas: r.ferramentasUsadas,
      acoes,
      custo_usd: r.custoUsd,
    };
  });
}
