// src/hooks/useBotAcerto.js
//
// Acerto do bot no período escolhido (issue #311). Atualiza quando uma reserva muda
// (a correção de alguém da equipe entra na hora).

import { botAcertoService } from "../services/botAcertoService";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useBotAcerto(dias) {
  const query = useSupabaseQuery(() => botAcertoService.resumo(dias), [dias]);
  useRealtimeTable("reservations", () => query.refetch());
  return {
    dados: query.data,
    carregando: query.loading,
    erro: query.error,
    recarregar: query.refetch,
  };
}
