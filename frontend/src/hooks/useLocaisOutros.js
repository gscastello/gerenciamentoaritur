// src/hooks/useLocaisOutros.js
//
// Locais de Outros com preço próprio (issue #263), vivos entre os sócios.
// `preco(texto)` aplica a regra única do domínio: "retorno do aeroporto" nunca
// conta como aeroporto.

import { useCallback } from "react";
import { precoDoLocalDeOutros } from "../domain/precos.js";
import { locaisOutrosService } from "../services/locaisOutrosService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useLocaisOutros() {
  const q = useSupabaseQuery(() => locaisOutrosService.list(), []);
  useRealtimeTable("boarding_spot_prices", () => q.refetch());
  const salvarAcao = useAsyncAction(locaisOutrosService.upsert);
  const removerAcao = useAsyncAction(locaisOutrosService.remove);
  const locais = q.data ?? [];

  const salvar = useCallback(
    async (item) => {
      await salvarAcao.run(item);
      await q.refetch();
    },
    [salvarAcao, q],
  );
  const remover = useCallback(
    async (id) => {
      await removerAcao.run(id);
      await q.refetch();
    },
    [removerAcao, q],
  );
  const preco = useCallback((texto) => precoDoLocalDeOutros(texto, locais), [locais]);

  return {
    locais,
    loading: q.loading,
    error: q.error,
    recarregar: q.refetch,
    salvando: salvarAcao.loading || removerAcao.loading,
    salvar,
    remover,
    preco,
  };
}
