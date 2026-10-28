// Aprendizado do modo sombra (issue #218): regras puras da tela
// Sistema → Bot → Aprendizado. O bot observa as conversas e propõe "lições";
// aqui ficam o agrupamento por situação, os rótulos e os textos de resumo.

export const TIPOS_DE_LICAO = {
  linguagem_cliente: {
    rotulo: "Jeito dos clientes falarem",
    ajuda: "Ajuda o bot a entender gírias, abreviações e pedidos.",
  },
  estilo_atendente: {
    rotulo: "Estilo do atendente",
    ajuda: "Afina o tom e a forma das respostas do bot.",
  },
  fluxo_agendamento: {
    rotulo: "Como o atendente agenda",
    ajuda: "O que o atendente pergunta para fechar uma passagem e em que ordem.",
  },
  fato: {
    rotulo: "Informação do atendente",
    ajuda: "Regra, valor ou horário dito ao cliente. Só vale depois de aprovada.",
  },
};

/** Divide as lições pelo que o dono precisa fazer com elas. */
export function separarLicoes(licoes = []) {
  const paraRevisar = [];
  const emUso = [];
  const descartadas = [];
  for (const l of licoes) {
    if (l.status === "proposta" || (l.status === "ativa" && l.needs_review)) paraRevisar.push(l);
    else if (l.status === "ativa") emUso.push(l);
    else descartadas.push(l);
  }
  const maisVistaPrimeiro = (a, b) =>
    (b.evidence_count ?? 1) - (a.evidence_count ?? 1) ||
    String(b.last_seen_at ?? "").localeCompare(String(a.last_seen_at ?? ""));
  return {
    paraRevisar: paraRevisar.sort(maisVistaPrimeiro),
    emUso: emUso.sort(maisVistaPrimeiro),
    descartadas: descartadas.sort(maisVistaPrimeiro),
  };
}

/** O que acontece quando o dono mexe numa lição. */
export function mudancaDaRevisao(
  licao,
  acao,
  { agora = new Date().toISOString(), ator = null } = {},
) {
  const revisada = { reviewed_at: agora, reviewed_by: ator, needs_review: false };
  switch (acao) {
    case "aprovar": // proposta -> passa a valer
    case "confirmar": // já valia; o dono conferiu
      return { ...revisada, status: "ativa" };
    case "recusar":
      return { ...revisada, status: "recusada" };
    case "arquivar":
      return { ...revisada, status: "arquivada" };
    case "restaurar": // volta para a fila de revisão, nunca direto para valer
      return { status: "proposta", needs_review: true, reviewed_at: null, reviewed_by: null };
    default:
      throw new Error(`Ação desconhecida: ${acao} (${licao?.id ?? "?"})`);
  }
}

/** "há 3 h", "há 2 dias", "ainda não" — para a linha de números. */
export function haQuantoTempo(iso, agora = new Date()) {
  if (!iso) return "ainda não";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t < new Date("2001-01-01").getTime()) return "ainda não";
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Resultado do "Aprender agora" em uma frase. */
export function mensagemDoAprendizado(r) {
  if (!r || r.observacoes === 0) {
    return "Nada novo para aprender: nenhuma conversa observada desde a última vez.";
  }
  const partes = [];
  if (r.novas) partes.push(`${r.novas} lição(ões) nova(s)`);
  if (r.reforcos) partes.push(`${r.reforcos} reforçada(s)`);
  if (r.atualizadas) partes.push(`${r.atualizadas} atualizada(s)`);
  const lido = `Li ${r.observacoes} mensagem(ns).`;
  return partes.length ? `${lido} ${partes.join(", ")}.` : `${lido} Nada de novo para registrar.`;
}
