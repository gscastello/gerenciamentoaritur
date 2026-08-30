// Diagnóstico e auto-correção de reservas. Roda sob demanda na aba Sistema
// e, em produção, vira job agendado (issue #9). Regra dura: só corrige
// automaticamente o que é seguro (quantidade inválida -> 1). Overbooking,
// ponto inexistente, telefone ausente e id duplicado são REPORTADOS, nunca
// corrigidos sozinhos.

import { OCUPA_VAGA, TIPOS_SEM_VAGA } from "./constants.js";
import { fmtDate } from "./format.js";

export function runDiagnostics(reservas, capacidade, trips) {
  const issues = [];
  const fixed = [];
  const vistos = new Set();

  const corrigidas = reservas.map((r) => {
    const novo = { ...r };

    if (!novo.quantidade || novo.quantidade < 1 || Number.isNaN(Number(novo.quantidade))) {
      fixed.push(
        `Reserva de ${novo.nome || "cliente sem nome"} tinha quantidade inválida — corrigida para 1.`,
      );
      novo.quantidade = 1;
    }

    if (novo.direcao && !trips[novo.direcao]) {
      issues.push(`Reserva ${novo.id} com direção inválida (${novo.direcao}).`);
    } else if (
      novo.direcao &&
      !trips[novo.direcao].pontos.find((p) => p.id === novo.pontoId)
    ) {
      issues.push(`Reserva ${novo.id} aponta para um local de embarque que não existe mais.`);
    }

    if (!novo.telefone) {
      issues.push(
        `Reserva de ${novo.nome || "cliente sem nome"} em ${novo.data} está sem telefone de contato.`,
      );
    }

    if (vistos.has(novo.id)) issues.push(`ID de reserva duplicado: ${novo.id}.`);
    vistos.add(novo.id);

    return novo;
  });

  const porViagem = {};
  for (const r of corrigidas) {
    if (!OCUPA_VAGA.includes(r.status) || TIPOS_SEM_VAGA.includes(r.tipo)) continue;
    const k = `${r.data}__${r.direcao}`;
    porViagem[k] = (porViagem[k] || 0) + r.quantidade;
  }
  for (const [k, total] of Object.entries(porViagem)) {
    if (total > capacidade) {
      const [data, direcao] = k.split("__");
      issues.push(
        `Possível overbooking em ${fmtDate(data)} (${trips[direcao]?.nome}): ${total}/${capacidade} lugares.`,
      );
    }
  }

  return { corrigidas, issues, fixed };
}
