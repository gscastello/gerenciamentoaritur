// src/services/documentosService.js
//
// Notas e recibos lidos por foto (issues #362 e #369, database/99). A leitura é
// da Edge Function `ler-documento`; aqui o app só pede a leitura e marca o que a
// pessoa fez com ela (lançou ou descartou).

import { ServiceError, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const documentosService = {
  /** Manda a foto para a IA ler. Devolve { id, leitura }. */
  async ler({ imagem, mediaType, tipo }) {
    const { data, error } = await supabase.functions.invoke("ler-documento", {
      body: { imagem, media_type: mediaType, tipo },
    });
    if (error) {
      let msg = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.message) msg = body.message;
      } catch {
        /* usa error.message */
      }
      throw new ServiceError(msg || "Não consegui ler a foto.", {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    if (!data?.success) throw new ServiceError(data?.message || "Não consegui ler a foto.");
    return { id: data.id, leitura: data.leitura };
  },

  /** Marca a leitura como lançada (com o que foi criado) ou descartada. */
  async marcar(id, { status, financialEntryId, fuelRecordId, maintenanceId }) {
    const { error } = await supabase
      .from("documentos_lidos")
      .update({
        status,
        financial_entry_id: financialEntryId ?? null,
        fuel_record_id: fuelRecordId ?? null,
        maintenance_id: maintenanceId ?? null,
      })
      .eq("id", id);
    if (error)
      throw new ServiceError(`marcarDocumento: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
  },
};
