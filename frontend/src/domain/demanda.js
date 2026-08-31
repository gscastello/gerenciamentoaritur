// Previsão de demanda por dia da semana: média histórica simples de
// passageiros confirmados por data, agrupada por weekday. Ao crescer o
// volume, trocar por série temporal real (ver AGENTS.md §9).

import { OCUPA_VAGA, TIPOS_SEM_VAGA } from "./constants.js";

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export function previsaoDemanda(reservas) {
  const porDia = {};
  for (const r of reservas) {
    if (!OCUPA_VAGA.includes(r.status) || TIPOS_SEM_VAGA.includes(r.tipo)) continue;
    const wd = new Date(`${r.data}T12:00:00`).getDay();
    if (!porDia[wd]) porDia[wd] = { soma: 0, datas: new Set() };
    porDia[wd].soma += Number(r.quantidade) || 1;
    porDia[wd].datas.add(r.data);
  }

  const medias = {};
  for (const [wd, v] of Object.entries(porDia)) {
    medias[wd] = v.datas.size ? v.soma / v.datas.size : 0;
  }

  const valores = Object.values(medias).filter((v) => v > 0);
  const mediaGeral = valores.length
    ? valores.reduce((a, b) => a + b, 0) / valores.length
    : 0;

  return DIAS_SEMANA.map((nome, idx) => ({
    idx,
    nome,
    media: medias[idx] || 0,
    amostras: porDia[idx] ? porDia[idx].datas.size : 0,
    diffPct:
      mediaGeral > 0 && medias[idx]
        ? Math.round(((medias[idx] - mediaGeral) / mediaGeral) * 100)
        : 0,
  }));
}
