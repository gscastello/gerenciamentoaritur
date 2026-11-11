// src/services/locaisOutrosService.js
//
// Locais da categoria Outros com preço próprio (database/74, issue #263): o
// embarque DENTRO do aeroporto custa diferente. Ler é de admin/atendente; mudar
// é só do admin (Sistema → Preços). O Retorno nunca entra aqui (o banco recusa).

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isNetworkish(error),
    });
  return data;
}

export const locaisOutrosService = {
  async list() {
    return handle(
      supabase.from("boarding_spot_prices").select("id, local, price").order("local"),
      "listLocaisOutros",
    );
  },

  async upsert({ local, price }) {
    const data = await handle(
      supabase.rpc("rpc_upsert_boarding_spot_price", { p_local: local, p_price: price }),
      "upsertLocalOutros",
    );
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível salvar o local.", {
        retryable: false,
      });
    return data;
  },

  async remove(id) {
    return handle(supabase.from("boarding_spot_prices").delete().eq("id", id), "removeLocalOutros");
  },
};
