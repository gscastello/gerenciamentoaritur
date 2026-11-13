// src/hooks/useFechamento.js
//
// Fechamento do mês (issue #365): abre no mês anterior, busca o pacote do banco
// e as receitas dos 12 meses anteriores, estima o DAS com o anexo/alíquota da
// aba Vencimentos e monta tudo em domain/fechamentoDoMes.js.

import { useMemo, useState } from "react";
import { mesAnterior, montarFechamento } from "../domain/fechamentoDoMes.js";
import { todayStr } from "../domain/format.js";
import { estimarDas, mesesDoRbt12, receitasPorMes } from "../domain/simplesNacional.js";
import { fechamentoService } from "../services/fechamentoService";
import { useExpenseCategories } from "./useExpenseCategories.js";
import { useSettings } from "./useSettings.js";
import { useSupabaseQuery } from "./useSupabaseQuery";

const NOMES = {
  passagem: "Passagem",
  outro: "Outro",
  estorno: "Estorno",
  sem_categoria: "Sem categoria",
};

const ultimoDia = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function useFechamento() {
  const [mes, setMes] = useState(() => mesAnterior(todayStr()));
  const cfg = useSettings();
  const cats = useExpenseCategories();
  const pacote = useSupabaseQuery(() => fechamentoService.doMes(mes), [mes]);
  const desde = `${mesesDoRbt12(mes)[0]}-01`;
  const ate = ultimoDia(mes);
  const receitas = useSupabaseQuery(
    () => fechamentoService.receitasDesde(desde, ate),
    [desde, ate],
  );

  const { existe, rotulo: rotuloDaCategoria } = cats;
  const anexo = cfg.simples?.anexo ?? "III";
  const aliquotaManual = cfg.simples?.aliquotaManual ?? null;
  const fechamento = useMemo(() => {
    if (!pacote.data) return null;
    const das = receitas.data
      ? estimarDas({ mes, receitas: receitasPorMes(receitas.data), anexo, aliquotaManual })
      : null;
    const rotulo = (slug) => (existe(slug) ? rotuloDaCategoria(slug) : (NOMES[slug] ?? slug));
    return montarFechamento(pacote.data, { das, rotulo });
  }, [pacote.data, receitas.data, mes, anexo, aliquotaManual, existe, rotuloDaCategoria]);

  return {
    mes,
    setMes,
    fechamento,
    loading: pacote.loading || receitas.loading,
    error: pacote.error || receitas.error,
    recarregar: () => Promise.all([pacote.refetch(), receitas.refetch()]),
    urlDaNota: fechamentoService.urlDaNota,
  };
}
