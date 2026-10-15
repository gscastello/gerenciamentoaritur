// src/hooks/useBotKnowledge.js
import { useCallback } from "react";
import { botKnowledgeService } from "../services/botKnowledgeService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useBotKnowledge() {
  const query = useSupabaseQuery(() => botKnowledgeService.list(), []);
  useRealtimeTable("bot_knowledge", () => query.refetch());

  const createAcao = useAsyncAction(botKnowledgeService.create);
  const updateAcao = useAsyncAction(botKnowledgeService.update);
  const removeAcao = useAsyncAction(botKnowledgeService.remove);

  const criar = useCallback(
    async (item) => {
      const r = await createAcao.run(item);
      await query.refetch();
      return r;
    },
    [createAcao, query],
  );
  const atualizar = useCallback(
    async (id, fields) => {
      const r = await updateAcao.run(id, fields);
      await query.refetch();
      return r;
    },
    [updateAcao, query],
  );
  const remover = useCallback(
    async (id) => {
      await removeAcao.run(id);
      await query.refetch();
    },
    [removeAcao, query],
  );

  return {
    itens: query.data ?? [],
    loading: query.loading,
    error: query.error,
    salvando: createAcao.loading || updateAcao.loading || removeAcao.loading,
    recarregar: query.refetch,
    criar,
    atualizar,
    remover,
  };
}
