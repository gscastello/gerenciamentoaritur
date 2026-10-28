// src/hooks/useBotLearnings.js
//
// Lições aprendidas no modo sombra + números da observação (issue #218).

import { useCallback, useMemo } from "react";
import { mudancaDaRevisao, separarLicoes } from "../domain/botAprendizado";
import { botLearningService } from "../services/botLearningService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useBotLearnings() {
  const lista = useSupabaseQuery(() => botLearningService.list(), []);
  const numeros = useSupabaseQuery(() => botLearningService.stats(), []);
  useRealtimeTable("bot_learnings", () => lista.refetch());

  const atualizar = useAsyncAction(botLearningService.update);
  const aprender = useAsyncAction(botLearningService.learnNow);

  const grupos = useMemo(() => separarLicoes(lista.data ?? []), [lista.data]);

  const revisar = useCallback(
    async (licao, acao) => {
      const ator = await botLearningService.currentUserId();
      await atualizar.run(licao.id, mudancaDaRevisao(licao, acao, { ator }));
      await lista.refetch();
    },
    [atualizar, lista],
  );

  const editar = useCallback(
    async (licao, { title, content }) => {
      const ator = await botLearningService.currentUserId();
      await atualizar.run(licao.id, {
        title,
        content,
        ...(licao.status === "ativa" ? mudancaDaRevisao(licao, "confirmar", { ator }) : {}),
      });
      await lista.refetch();
    },
    [atualizar, lista],
  );

  const aprenderAgora = useCallback(async () => {
    const resumo = await aprender.run();
    await Promise.all([lista.refetch(), numeros.refetch()]);
    return resumo;
  }, [aprender, lista, numeros]);

  return {
    ...grupos,
    numeros: numeros.data ?? null,
    loading: lista.loading,
    error: lista.error ?? numeros.error,
    recarregar: () => Promise.all([lista.refetch(), numeros.refetch()]),
    salvando: atualizar.loading,
    aprendendo: aprender.loading,
    revisar,
    editar,
    aprenderAgora,
  };
}
