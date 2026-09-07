// src/hooks/useDropoffAreas.js
//
// Baldes de desembarque vivos (lista + realtime). Expõe helpers no mesmo
// contrato dos antigos `baldesDesembarque` / `DETALHE_DESEMBARQUE`.

import { useCallback, useMemo } from "react";
import { dropoffAreasService } from "../services/dropoffAreasService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useDropoffAreas() {
  const query = useSupabaseQuery(() => dropoffAreasService.list(), []);
  useRealtimeTable("dropoff_areas", () => query.refetch());

  const criarAcao = useAsyncAction(dropoffAreasService.upsert);
  const editarAcao = useAsyncAction(dropoffAreasService.update);
  const removerAcao = useAsyncAction(dropoffAreasService.remove);

  const todas = query.data ?? [];

  const api = useMemo(() => {
    const ativas = todas.filter((a) => a.active);
    const porDirecao = (dir) => ativas.filter((a) => a.direction === dir);
    const idx = Object.fromEntries(todas.map((a) => [`${a.direction}:${a.code}`, a]));
    return {
      todas,
      ida: porDirecao("ida"),
      volta: porDirecao("volta"),
      porDirecao,
      rotulo: (dir, code) => idx[`${dir}:${code}`]?.label || code || "—",
      detalhe: (dir, code) => {
        const a = idx[`${dir}:${code}`];
        return {
          label: a?.detail_label || "Ponto de referência",
          ph: a?.detail_placeholder || "",
          req: !!a?.detail_required,
        };
      },
      obrigatorio: (dir, code) => !!idx[`${dir}:${code}`]?.detail_required,
    };
  }, [todas]);

  const criar = useCallback(
    async (fields) => {
      const r = await criarAcao.run(fields);
      await query.refetch();
      return r;
    },
    [criarAcao, query],
  );
  const editar = useCallback(
    async (id, fields) => {
      const r = await editarAcao.run(id, fields);
      await query.refetch();
      return r;
    },
    [editarAcao, query],
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
    ...api,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    criar,
    editar,
    remover,
    salvando: criarAcao.loading || editarAcao.loading || removerAcao.loading,
  };
}
