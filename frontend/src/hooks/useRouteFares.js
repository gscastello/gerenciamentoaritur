// src/hooks/useRouteFares.js
//
// Tabela de preços por trecho + sugestões de preço do bot, vivas entre os sócios.

import { useCallback } from "react";
import { routeFaresService } from "../services/routeFaresService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useRouteFares() {
  const trechos = useSupabaseQuery(() => routeFaresService.list(), []);
  const sugestoes = useSupabaseQuery(() => routeFaresService.listSuggestions(), []);
  useRealtimeTable("route_fares", () => trechos.refetch());
  useRealtimeTable("bot_price_suggestions", () => sugestoes.refetch());

  const salvarAcao = useAsyncAction(routeFaresService.upsert);
  const removerAcao = useAsyncAction(routeFaresService.remove);
  const revisarAcao = useAsyncAction(routeFaresService.reviewSuggestion);

  const salvar = useCallback(
    async (trecho) => {
      await salvarAcao.run(trecho);
      await trechos.refetch();
    },
    [salvarAcao, trechos],
  );
  const remover = useCallback(
    async (id) => {
      await removerAcao.run(id);
      await trechos.refetch();
    },
    [removerAcao, trechos],
  );
  const revisar = useCallback(
    async (decisao) => {
      await revisarAcao.run(decisao);
      await Promise.all([sugestoes.refetch(), trechos.refetch()]);
    },
    [revisarAcao, sugestoes, trechos],
  );

  return {
    trechos: trechos.data ?? [],
    sugestoes: sugestoes.data ?? [],
    loading: trechos.loading || sugestoes.loading,
    error: trechos.error || sugestoes.error,
    recarregar: () => {
      trechos.refetch();
      sugestoes.refetch();
    },
    salvando: salvarAcao.loading || removerAcao.loading || revisarAcao.loading,
    salvar,
    remover,
    revisar,
  };
}
