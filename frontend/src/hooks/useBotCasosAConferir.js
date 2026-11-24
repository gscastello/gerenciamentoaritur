// src/hooks/useBotCasosAConferir.js
//
// Casos do bot que mudaram depois da marca e faltam conferir (issue #508).

import { botCasosService } from "../services/botCasosService";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useBotCasosAConferir() {
  const query = useSupabaseQuery(() => botCasosService.aConferir(), []);
  return {
    casos: query.data ?? [],
    carregando: query.loading,
    erro: query.error,
    recarregar: query.refetch,
    conferir: (id, vale, observacao) => botCasosService.conferir(id, vale, observacao),
  };
}
