// src/hooks/useRouteConfig.js
//
// Monta o objeto `config` que o App.jsx usa (trips com pontos + ajuste de
// segunda-feira) a partir do Postgres: `route_points` + `settings`. Antes
// isso vivia em localStorage e cada sócio editava a própria cópia.

import { useMemo } from "react";
import { routePointsService } from "../services/routePointsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";
import { useSettings } from "./useSettings";

// o formulário do cliente decide o campo extra pelo código do ponto
const CAMPO_POR_CODE = { busca: "bairro", br: "localExato", outro: "localOutro" };

const WRAP = {
  ida: { id: "ida", nome: "Ida", direcao: "ida", label: "São Luís → Pirapemas / Cantanhede" },
  volta: { id: "volta", nome: "Volta", direcao: "volta", label: "Pirapemas / Cantanhede → São Luís" },
};

function mapPoint(rp) {
  return {
    id: rp.code,
    _dbId: rp.id,
    nome: rp.name,
    horaBase: (rp.base_time || "00:00:00").slice(0, 5),
    valor: rp.price != null ? Number(rp.price) : rp.code === "busca" ? 80 : 60,
    campo: CAMPO_POR_CODE[rp.code],
    campoLabel: rp.detail_label || undefined,
    core: rp.is_core,
    janela: rp.boarding_window || undefined,
  };
}

export function useRouteConfig() {
  const query = useSupabaseQuery(() => routePointsService.listAll(), []);
  useRealtimeTable("route_points", () => query.refetch());
  const settings = useSettings();

  const update = useAsyncAction(routePointsService.update);
  const add = useAsyncAction(routePointsService.addCustomPoint);
  const remove = useAsyncAction(routePointsService.removeCustomPoint);
  const after = async (p) => { const r = await p; await query.refetch(); return r; };

  const trips = useMemo(() => {
    const rows = (query.data || []).filter((r) => r.active !== false);
    const build = (dir) => ({
      ...WRAP[dir],
      pontos: rows
        .filter((r) => r.direction === dir)
        .sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99))
        .map(mapPoint),
    });
    return { ida: build("ida"), volta: build("volta") };
  }, [query.data]);

  // mapeia o campo da UI ('nome' | 'horaBase' | 'valor') para a coluna do banco
  const COL = { nome: "name", horaBase: "base_time", valor: "price" };

  return {
    trips,
    segundaAtiva: settings.mondayAdjustment?.active ?? true,
    segundaHoras: settings.mondayAdjustment?.hours ?? 1,
    loading: query.loading || settings.loading,
    error: query.error || settings.error,

    atualizarPonto: (dbId, campo, valor) => {
      const col = COL[campo];
      let v = valor;
      if (campo === "valor") v = Number.parseFloat(valor) || 0;
      if (campo === "horaBase" && /^\d{2}:\d{2}$/.test(valor)) v = `${valor}:00`;
      return after(update.run(dbId, { [col]: v }));
    },
    addPonto: (direction, nome) =>
      after(add.run({ direction, name: nome, baseTime: "05:40:00", price: 60 })),
    removerPonto: (dbId) => after(remove.run(dbId)),
    setSegunda: ({ active, hours }) => settings.setMondayAdjustment({ active, hours }),
    saving: update.loading || add.loading || remove.loading || settings.saving,
  };
}
