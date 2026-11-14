// src/hooks/useViagensDoPeriodo.js
//
// Os lugares de cada viagem (issue #408). Cada viagem guarda o veículo e a capacidade
// (ônibus 31, van reserva 15 — escolhida por dia na Operação). A Agenda, o Início e a Nova
// reserva mostram as vagas da VIAGEM do dia, não as do veículo padrão. Só exibição: quem
// impede overbooking é a trava do banco.

import { useCallback, useMemo } from "react";
import { todayStr } from "../domain/format.js";
import { capacidadeDaViagem, viagensForaDoPadrao } from "../domain/frota.js";
import { tripsService } from "../services/tripsService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

const somarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Viagens de hoje até `dias` à frente. `padrao` = veículo padrão (capacidade de quem ainda não tem viagem). */
export function useViagensDoPeriodo(padrao, dias = 90) {
  const hoje = todayStr();
  const ate = somarDias(hoje, dias);
  const query = useSupabaseQuery(() => tripsService.listCapacidades(hoje, ate), [hoje, ate], {
    offlineKey: "capacidades",
  });
  useRealtimeTable("trips", () => query.refetch());
  const trocar = useAsyncAction(tripsService.trocarVeiculo);

  const viagens = query.data ?? [];
  const capPadrao = padrao?.capacity ?? 31;
  const capacidadeDe = useCallback(
    (data, direcao) => capacidadeDaViagem(viagens, data, direcao, capPadrao),
    [viagens, capPadrao],
  );
  const foraDoPadrao = useMemo(
    () => viagensForaDoPadrao(viagens, padrao?.id),
    [viagens, padrao?.id],
  );

  return {
    viagens,
    capacidadeDe,
    foraDoPadrao,
    loading: query.loading,
    trocarVeiculo: async (data, direcao, vehicleId) => {
      const r = await trocar.run(data, direcao, vehicleId);
      await query.refetch();
      return r;
    },
  };
}
