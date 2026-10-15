// src/hooks/useAtendimento.js
//
// Fila de atendimento do WhatsApp: conversas (espelho do Chatwoot) e
// perguntas sem resposta do bot. Atualiza sozinha via Realtime.

import { useCallback } from "react";
import { atendimentoService } from "../services/atendimentoService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useAtendimento({ enabled = true } = {}) {
  const conversas = useSupabaseQuery(() => atendimentoService.listarConversas(), [enabled], {
    enabled,
  });
  const perguntas = useSupabaseQuery(() => atendimentoService.listarPerguntas(), [enabled], {
    enabled,
  });
  useRealtimeTable("whatsapp_conversations", () => conversas.refetch(), { enabled });
  useRealtimeTable("bot_unanswered", () => perguntas.refetch(), { enabled });

  const resolverAcao = useAsyncAction(atendimentoService.resolverPergunta);
  const resolverPergunta = useCallback(
    async (id) => {
      await resolverAcao.run(id);
      await perguntas.refetch();
    },
    [resolverAcao, perguntas],
  );

  return {
    conversas: conversas.data ?? [],
    perguntas: perguntas.data ?? [],
    loading: conversas.loading || perguntas.loading,
    errorConversas: conversas.error,
    errorPerguntas: perguntas.error,
    recarregarConversas: conversas.refetch,
    recarregarPerguntas: perguntas.refetch,
    resolverPergunta,
  };
}
