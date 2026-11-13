// src/hooks/useVencimentos.js
//
// Vencimentos (issues #366 e #369) e a estimativa do DAS do Simples Nacional.

import { useCallback, useMemo } from "react";
import { todayStr } from "../domain/format.js";
import { estimarDas, mesDeApuracao, receitasPorMes } from "../domain/simplesNacional.js";
import { vencimentosService } from "../services/vencimentosService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useVencimentos({ anexo = "III", aliquotaManual = null } = {}) {
  const lista = useSupabaseQuery(() => vencimentosService.listar(), []);
  useRealtimeTable("vencimentos", () => lista.refetch());
  // 14 meses de receitas cobrem o mês de apuração + os 12 anteriores
  const desde = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 14, 1))
      .toISOString()
      .slice(0, 10);
  }, []);
  const receitas = useSupabaseQuery(() => vencimentosService.receitasDesde(desde), [desde]);

  const criarAcao = useAsyncAction(vencimentosService.criar);
  const quitarAcao = useAsyncAction(vencimentosService.quitar);
  const removerAcao = useAsyncAction(vencimentosService.remover);
  const depois = useCallback(
    (acao) =>
      async (...args) => {
        const r = await acao.run(...args);
        await lista.refetch();
        return r;
      },
    [lista],
  );

  const vencimentos = lista.data ?? [];
  // o DAS em aberto mais próximo define o mês de apuração da estimativa
  const das = useMemo(() => {
    const proximo = vencimentos
      .filter((v) => v.categoria === "imposto" && !v.quitado_em && /^DAS/i.test(v.titulo))
      .sort((a, b) => a.vence_em.localeCompare(b.vence_em))[0];
    const mes = proximo
      ? mesDeApuracao(proximo.vence_em)
      : mesDeApuracao(`${todayStr().slice(0, 7)}-20`);
    const est = estimarDas({ mes, receitas: receitasPorMes(receitas.data), anexo, aliquotaManual });
    return est ? { ...est, vencimento: proximo ?? null } : null;
  }, [vencimentos, receitas.data, anexo, aliquotaManual]);

  return {
    vencimentos,
    das,
    loading: lista.loading,
    error: lista.error || receitas.error,
    recarregar: lista.refetch,
    criar: depois(criarAcao),
    quitar: depois(quitarAcao),
    remover: depois(removerAcao),
    salvando: criarAcao.loading || quitarAcao.loading || removerAcao.loading,
  };
}
