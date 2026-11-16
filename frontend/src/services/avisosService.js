// src/services/avisosService.js
//
// "Avisar passageiros" (issue #432): envia pela Edge Function `avisar-passageiros` (Chatwoot →
// WhatsApp) e lê o que já foi enviado em `avisos_passageiros`. Enviar NUNCA é repetido sozinho
// (retryable: false) — uma nova tentativa poderia mandar a mesma mensagem duas vezes.

import { ServiceError, isRetryableError, supabase } from "../lib/supabaseClient";

export const avisosService = {
  /** Os avisos já registrados da viagem (o mais recente de cada reserva decide "já avisado"). */
  async listar(data, direcao) {
    const { data: linhas, error } = await supabase
      .from("avisos_passageiros")
      .select("reservation_id, tipo, status, modo, erro, criado_em")
      .eq("trip_date", data)
      .eq("direction", direcao)
      .order("criado_em", { ascending: false });
    if (error) {
      throw new ServiceError(`avisos: ${error.message}`, {
        cause: error,
        retryable: isRetryableError(error),
      });
    }
    return linhas ?? [];
  },

  /**
   * Envia; `itens` = [{ reservation_id, texto, nome, dia, ponto, horario }]; `tipo` = horario |
   * confirmacao | em_rota (o modelo da Meta de cada um). Devolve o resultado de cada passageiro.
   */
  async enviar(itens, tipo = "horario") {
    const { data, error } = await supabase.functions.invoke("avisar-passageiros", {
      body: { itens, tipo },
    });
    if (error) {
      let msg = error.message;
      try {
        const corpo = await error.context?.json?.();
        if (corpo?.message) msg = corpo.message;
      } catch {
        /* usa error.message */
      }
      throw new ServiceError(msg || "O envio não respondeu.", { cause: error, retryable: false });
    }
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível enviar.", { retryable: false });
    return data.resultados ?? [];
  },
};
