// src/hooks/useNeighborhoodPricing.js
//
// Preço de "Buscar em Casa" por bairro, vivo (lista + realtime). Expõe
// `preco(bairro)` no mesmo contrato da função antiga `precoBairro`:
//   número  -> bairro reconhecido
//   null    -> texto informado mas não cadastrado (encaminhar p/ atendente)
//   undefined -> nada informado

import { useCallback, useMemo } from "react";
import { neighborhoodPricingService } from "../services/neighborhoodPricingService";
import { normalizar } from "../domain/format.js";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useNeighborhoodPricing() {
  const query = useSupabaseQuery(() => neighborhoodPricingService.list(), []);
  useRealtimeTable("neighborhood_pricing", () => query.refetch());

  const upsertAcao = useAsyncAction(neighborhoodPricingService.upsert);
  const removerAcao = useAsyncAction(neighborhoodPricingService.remove);

  const bairros = query.data ?? [];

  const porNome = useMemo(() => {
    const m = {};
    for (const b of bairros) m[normalizar(b.neighborhood)] = Number(b.price);
    return m;
  }, [bairros]);

  const preco = useCallback(
    (bairro) => {
      const n = normalizar(bairro);
      if (!n) return undefined;
      return n in porNome ? porNome[n] : null;
    },
    [porNome],
  );

  const salvar = useCallback(
    async (neighborhood, price) => {
      const r = await upsertAcao.run(neighborhood, price);
      await query.refetch();
      return r;
    },
    [upsertAcao, query],
  );
  const remover = useCallback(
    async (id) => {
      const r = await removerAcao.run(id);
      await query.refetch();
      return r;
    },
    [removerAcao, query],
  );

  return {
    bairros,
    nomes: bairros.map((b) => b.neighborhood),
    preco,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    salvar,
    remover,
    salvando: upsertAcao.loading || removerAcao.loading,
  };
}
