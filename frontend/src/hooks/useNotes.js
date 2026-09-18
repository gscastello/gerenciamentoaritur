// src/hooks/useNotes.js
//
// Estado do bloco de notas: lista todas as notas, cria/apaga/fixa na
// hora (otimista — o Realtime/refetch reconcilia depois) e salva o
// texto sozinho por nota (debounce ~1s, cada nota com seu próprio
// temporizador). Mesma política de "quem salvou por último vence" do
// bloco por-data antigo — uso real é uma pessoa por nota de cada vez.

import { useCallback, useRef } from "react";
import { notesService } from "../services/notesService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

const DEBOUNCE_MS = 1000;

export function useNotes() {
  const query = useSupabaseQuery(() => notesService.list(), []);
  useRealtimeTable("notes", () => query.refetch());

  const creator = useAsyncAction(notesService.create);
  const updater = useAsyncAction(notesService.update);
  const remover = useAsyncAction(notesService.remove);

  const timersRef = useRef({});

  const create = useCallback(async () => {
    const row = await creator.run("");
    query.mutate((prev) => [row, ...(prev ?? [])]);
    return row;
  }, [creator, query]);

  const scheduleSave = useCallback(
    (id, content) => {
      query.mutate((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, content } : n)));
      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(async () => {
        delete timersRef.current[id];
        try {
          await updater.run(id, { content });
        } catch {
          // erro fica em updater.error; a nota mantém o texto local —
          // o usuário pode editar de novo pra tentar salvar outra vez.
        }
      }, DEBOUNCE_MS);
    },
    [updater, query],
  );

  const flush = useCallback(
    async (id, content) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
        try {
          await updater.run(id, { content });
        } catch {
          // idem — erro visível via updater.error.
        }
      }
    },
    [updater],
  );

  const togglePin = useCallback(
    async (id, pinned) => {
      query.mutate((prev) =>
        (prev ?? [])
          .map((n) => (n.id === id ? { ...n, pinned: !pinned } : n))
          .sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1)),
      );
      await updater.run(id, { pinned: !pinned });
    },
    [updater, query],
  );

  const remove = useCallback(
    async (id) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      query.mutate((prev) => (prev ?? []).filter((n) => n.id !== id));
      await remover.run(id);
    },
    [remover, query],
  );

  return {
    notes: query.data ?? [],
    loading: query.loading,
    error: query.error,
    create,
    creating: creator.loading,
    scheduleSave,
    flush,
    saveError: updater.error,
    togglePin,
    remove,
  };
}
