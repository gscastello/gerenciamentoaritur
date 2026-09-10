// src/hooks/useNotifications.js
//
// Estado do sino de notificações: carrega o mural, atualiza sozinho via
// Realtime (novo evento OU alguém marcou como lida noutro dispositivo),
// e expõe a contagem de não lidas + ações de marcar como lida.
//
// Pensado para ser chamado UMA vez (no AppInner) e distribuído por
// contexto — assim há só uma assinatura de Realtime.

import { useCallback } from "react";
import { notificationsService } from "../services/notificationsService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

export function useNotifications({ enabled = true } = {}) {
  const query = useSupabaseQuery(() => notificationsService.list(), [enabled], { enabled });
  const marcar = useAsyncAction(notificationsService.markRead);
  const marcarTodas = useAsyncAction(notificationsService.markAllRead);

  useRealtimeTable(
    ["app_notifications", "app_notification_reads"],
    () => query.refetch(),
    { enabled },
  );

  const lista = query.data ?? [];
  const naoLidas = lista.filter((n) => !n.lida).length;

  const marcarLida = useCallback(
    async (id) => {
      await marcar.run([id]);
      query.refetch();
    },
    [marcar, query],
  );

  const marcarTodasLidas = useCallback(async () => {
    await marcarTodas.run();
    query.refetch();
  }, [marcarTodas, query]);

  return {
    notificacoes: lista,
    naoLidas,
    loading: query.loading,
    error: query.error,
    marcarLida,
    marcarTodasLidas,
    recarregar: query.refetch,
  };
}
