// src/services/botCasosService.js
//
// Casos do bot que mudaram depois do "Agendado ☑️" (issue #508, database/133): a lista dos que
// faltam conferir e a conferência do dono (vale o da marca ou o de agora). Só admin (a RPC confere).

import { ServiceError, supabase } from "../lib/supabaseClient";

export const botCasosService = {
  async aConferir() {
    const { data, error } = await supabase.rpc("rpc_bot_casos_a_conferir");
    if (error) throw new ServiceError(`botCasos.aConferir: ${error.message}`, { cause: error });
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível ler os casos do bot.");
    }
    return data.casos ?? [];
  },

  async conferir(caso, vale, observacao = null) {
    const { data, error } = await supabase.rpc("rpc_conferir_caso_bot", {
      p_caso: caso,
      p_vale: vale,
      p_observacao: observacao,
    });
    if (error) throw new ServiceError(`botCasos.conferir: ${error.message}`, { cause: error });
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível salvar a conferência.");
    }
    return data;
  },
};
