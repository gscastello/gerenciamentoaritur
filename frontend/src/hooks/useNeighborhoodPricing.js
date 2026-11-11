// src/hooks/useNeighborhoodPricing.js
//
// Preço de "Buscar em Casa" por bairro, vivo (lista + realtime). Expõe
// `preco(bairro)` no mesmo contrato da função antiga `precoBairro`:
//   número  -> bairro reconhecido
//   null    -> texto informado mas não cadastrado, OU cadastrado sem preço
//              (issue #330: o dono preenche depois) — nunca vira R$ 0
//   undefined -> nada informado

import { useCallback, useMemo } from "react";
import { normalizar } from "../domain/format.js";
import { neighborhoodPricingService } from "../services/neighborhoodPricingService";
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
    for (const b of bairros)
      m[normalizar(b.neighborhood)] = b.price == null ? null : Number(b.price);
    return m;
  }, [bairros]);

  const preco = useCallback(
    (bairro) => {
      const n = normalizar(bairro);
      if (!n) return undefined;
      return porNome[n] ?? null;
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
    // cadastrados sem preço (issue #330): aparecem no topo da aba Sistema para o dono preencher
    semPreco: bairros.filter((b) => b.price == null).length,
    preco,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    salvar,
    remover,
    salvando: upsertAcao.loading || removerAcao.loading,
  };
}
