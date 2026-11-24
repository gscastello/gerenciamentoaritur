// src/hooks/useCorrecoes.js
//
// Fila de correções para o Claude (issue #516): o que a equipe explicou ao assistente.

import { useCallback } from "react";
import { assistenteService } from "../services/assistenteService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useCorrecoes() {
  const query = useSupabaseQuery(() => assistenteService.listarCorrecoes(), []);
  const tirar = useAsyncAction(assistenteService.descartarCorrecao);
  const descartar = useCallback(
    async (id) => {
      await tirar.run(id);
      query.refetch();
    },
    [tirar, query],
  );
  return {
    lista: query.data ?? [],
    loading: query.loading && !query.data,
    erro: query.error ?? tirar.error,
    descartar,
  };
}
