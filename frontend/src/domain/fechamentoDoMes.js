// src/domain/fechamentoDoMes.js
//
// Fechamento do mês para o contador (issue #365). Recebe o que o banco devolve
// (rpc_fechamento_do_mes, database/105 — os números vêm de
// rpc_numeros_do_financeiro, a mesma conta do Assistente) e a estimativa do DAS
// (domain/simplesNacional.js), e monta as tabelas que viram o PDF, a planilha e
// o .zip das fotos das notas. Puro: sem React, sem I/O.

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const FORMAS = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  nao_informado: "Não informado",
};
const SENTIDOS = { ida: "Ida (sai de São Luís)", volta: "Volta (para São Luís)" };

const n2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** "2026-10" → "outubro de 2026". */
export function nomeDoMes(mes) {
  const [a, m] = String(mes ?? "").split("-");
  const nome = MESES[Number(m) - 1];
  // sem mês válido, nada de "undefined de undefined" na tela (auditoria, issue #397)
  return nome && a ? `${nome} de ${a}` : "";
}

/** O mês que o fechamento abre: o anterior ao de hoje ("AAAA-MM-DD" → "AAAA-MM"). */
export function mesAnterior(hoje) {
  const [a, m] = String(hoje).split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

/** Nome da foto da nota dentro do .zip: data, tipo, valor e a ordem (sem nome de pessoa). */
export function nomeDaFotoNoZip(lancamento, ordem) {
  const ext = (
    String(lancamento.nota ?? "").match(/\.(jpe?g|png|webp|heic)$/i)?.[1] ?? "jpg"
  ).toLowerCase();
  const valor = n2(lancamento.valor).toFixed(2).replace(".", ",");
  const cat = String(lancamento.categoria ?? "outro").replace(/[^a-z0-9_]/gi, "");
  return `${lancamento.data}_${cat}_${valor}_${String(ordem).padStart(3, "0")}.${ext}`;
}

/**
 * O pacote do mês.
 * dados: o JSON de rpc_fechamento_do_mes; das: estimarDas(...) ou null;
 * rotulo(slug): nome da categoria para gente.
 */
export function montarFechamento(dados, { das = null, rotulo = (s) => s } = {}) {
  const num = dados?.numeros ?? {};
  const l = num.lancamentos ?? {};
  const r = num.reservas ?? {};
  const receita = n2(l.receita);
  const despesa = n2(l.despesa);
  const imposto = das ? n2(das.valor) : null;

  const resumo = [
    { rotulo: "Receita (lançamentos)", valor: receita },
    { rotulo: "Despesas (lançamentos)", valor: -despesa },
    { rotulo: "Resultado antes do imposto", valor: n2(receita - despesa), destaque: true },
  ];
  if (imposto != null) {
    resumo.push({ rotulo: "DAS estimado do mês", valor: -imposto });
    resumo.push({
      rotulo: "Resultado depois do DAS estimado",
      valor: n2(receita - despesa - imposto),
      destaque: true,
    });
  }

  const despesasPorCategoria = Object.entries(l.despesa_por_categoria ?? {})
    .map(([slug, total]) => ({ categoria: rotulo(slug), total: n2(total) }))
    .sort((a, b) => b.total - a.total);
  const receitasPorCategoria = Object.entries(l.receita_por_categoria ?? {})
    .map(([slug, total]) => ({ categoria: rotulo(slug), total: n2(total) }))
    .sort((a, b) => b.total - a.total);

  const porSentido = Object.entries(r.por_sentido ?? {})
    .map(([s, v]) => ({
      sentido: SENTIDOS[s] ?? s,
      viagens: v.viagens ?? 0,
      passageiros: v.passageiros ?? 0,
      valor: n2(v.valor),
      ticketMedio: v.ticket_medio != null ? n2(v.ticket_medio) : null,
    }))
    .sort((a, b) => a.sentido.localeCompare(b.sentido));
  const porForma = Object.entries(r.por_forma_de_pagamento ?? {})
    .map(([f, valor]) => ({ forma: FORMAS[f] ?? f, valor: n2(valor) }))
    .sort((a, b) => b.valor - a.valor);
  const viagens = (num.viagens?.lista ?? [])
    .map((v) => ({
      data: v.data,
      sentido: v.sentido === "ida" ? "Ida" : "Volta",
      passageiros: v.passageiros ?? 0,
      valor: n2(v.valor),
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.sentido.localeCompare(b.sentido));

  const lancamentos = (dados?.lancamentos ?? []).map((x) => ({
    data: x.data,
    tipo: x.tipo === "receita" ? "Receita" : "Despesa",
    categoria: rotulo(x.categoria),
    valor: n2(x.valor),
    descricao: x.descricao ?? "",
    nota: x.nota ?? null,
  }));
  let ordem = 0;
  const notas = (dados?.lancamentos ?? [])
    .filter((x) => x.nota)
    .map((x) => {
      ordem += 1;
      return { arquivo: x.nota, nome: nomeDaFotoNoZip(x, ordem), data: x.data, valor: n2(x.valor) };
    });
  const comNota = new Map(notas.map((nt) => [nt.arquivo, nt.nome]));
  for (const x of lancamentos) x.foto = x.nota ? comNota.get(x.nota) : "";

  const avisos = [];
  const cobertura = r.cobertura_da_receita_pct;
  if (cobertura != null && cobertura < 90) {
    avisos.push(
      `As reservas do app somam ${String(cobertura).replace(".", ",")}% da receita lançada: parte das passagens não foi lançada no app, então os números por sentido e por viagem ficam por baixo.`,
    );
  }
  if (das?.mesesSemDado > 0) {
    avisos.push(
      `DAS estimado com ${das.mesesSemDado} dos 12 meses anteriores sem receita lançada no app (a faixa do Simples pode estar abaixo da real). O valor oficial é o do contador.`,
    );
  }
  const despesasSemNota = lancamentos.filter((x) => x.tipo === "Despesa" && !x.nota).length;
  if (despesasSemNota > 0) avisos.push(`${despesasSemNota} despesa(s) sem foto da nota.`);

  return {
    mes: dados?.mes,
    titulo: nomeDoMes(dados?.mes) ? `Fechamento de ${nomeDoMes(dados?.mes)}` : "Fechamento do mês",
    geradoEm: dados?.gerado_em ?? null,
    resumo,
    margemPct: l.margem_pct ?? null,
    das,
    receitasPorCategoria,
    despesasPorCategoria,
    porSentido,
    porForma,
    viagens,
    passageiros: r.passageiros ?? 0,
    ticketMedio: r.ticket_medio != null ? n2(r.ticket_medio) : null,
    lancamentos,
    notas,
    pagamentos: (dados?.pagamentos ?? []).map((p) => ({
      data: p.data,
      forma: FORMAS[p.forma] ?? p.forma,
      valor: n2(p.valor),
      viagem: p.viagem ?? null,
      sentido: p.sentido === "ida" ? "Ida" : p.sentido === "volta" ? "Volta" : "",
    })),
    contasQuitadas: (dados?.contas_quitadas ?? []).map((c) => ({
      titulo: c.titulo,
      valor: c.valor != null ? n2(c.valor) : null,
      venceEm: c.vence_em,
      quitadoEm: c.quitado_em,
    })),
    aReceber: num.a_receber ? n2(num.a_receber.total) : null,
    avisos,
  };
}
