// src/hooks/useAgendaNote.js
//
// Estado do bloco de notas da agenda para UMA data: carrega do banco,
// mantém o rascunho local, salva sozinho (debounce ~1,2s) e no blur, e
// adota mudanças de outro dispositivo via Realtime quando o campo não
// está sendo editado. Uso real = basicamente uma pessoa por vez, então
// a política em conflito é simples: o último save vence.
//
//   status: "idle" | "saving" | "saved" | "error"

import { useCallback, useEffect, useRef, useState } from "react";
import { agendaNotesService } from "../services/agendaNotesService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";

const DEBOUNCE_MS = 1200;

export function useAgendaNote(noteDate) {
  const query = useSupabaseQuery(() => agendaNotesService.get(noteDate), [noteDate]);
  const saver = useAsyncAction(agendaNotesService.save);
  useRealtimeTable("agenda_notes", () => query.refetch());

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);

  const draftRef = useRef("");
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const dateRef = useRef(noteDate);
  draftRef.current = draft;

  const loaded = query.data?.content ?? "";
  const loadedStamp = query.data?.updated_at ?? null;

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    const value = draftRef.current;
    const forDate = dateRef.current;
    setStatus("saving");
    try {
      const row = await saver.run(forDate, value);
      if (dateRef.current !== forDate) return;
      dirtyRef.current = draftRef.current !== value;
      setSavedAt(row?.updated_at ? new Date(row.updated_at) : new Date());
      setStatus(dirtyRef.current ? "idle" : "saved");
    } catch {
      setStatus("error");
    }
  }, [saver]);

  // Troca de data: descarta o rascunho, cancela save pendente.
  useEffect(() => {
    dateRef.current = noteDate;
    dirtyRef.current = false;
    setStatus("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [noteDate]);

  // Conteúdo vindo do banco (carga inicial ou Realtime): adota se o
  // usuário não está no meio de uma edição.
  useEffect(() => {
    if (dirtyRef.current) return;
    setDraft(loaded);
    setSavedAt(loadedStamp ? new Date(loadedStamp) : null);
  }, [loaded, loadedStamp]);

  const setContent = useCallback(
    (value) => {
      setDraft(value);
      dirtyRef.current = true;
      setStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return {
    content: draft,
    setContent,
    saveNow: flush,
    status,
    savedAt,
    loading: query.loading,
    error: query.error,
  };
}
