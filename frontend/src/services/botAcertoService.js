// src/services/botAcertoService.js
//
// Acerto do bot (issue #311, database/93-acerto-do-bot.sql): quantas reservas o bot
// lançou no período, quantas a equipe corrigiu e a lista das correções. Só admin e
// atendente (a RPC confere).

import { ServiceError, supabase } from "../lib/supabaseClient";

export const botAcertoService = {
  async resumo(dias = 30) {
    const { data, error } = await supabase.rpc("rpc_bot_acerto", { p_dias: dias });
    if (error) throw new ServiceError(`botAcerto.resumo: ${error.message}`, { cause: error });
    if (!data?.success) {
      throw new ServiceError(data?.message || "Não foi possível ler o acerto do bot.");
    }
    return data;
  },
};
