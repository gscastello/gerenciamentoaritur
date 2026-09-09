// src/services/agendaNotesService.js
//
// Bloco de notas livre da agenda — uma nota por data (tabela
// `agenda_notes`, ver database/26-agenda-notes.sql). NÃO é a Agenda
// estruturada: é o texto cru que o dono cola do Evernote durante a
// transição. Leitura para papéis operacionais; escrita admin/atendente
// (RLS). Não há DELETE — esvaziar o campo é um update normal.

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

export const agendaNotesService = {
  /** Nota de uma data (YYYY-MM-DD). Retorna um objeto vazio se ainda não existe. */
  async get(noteDate) {
    const { data, error } = await supabase
      .from("agenda_notes")
      .select("note_date, content, updated_at, updated_by")
      .eq("note_date", noteDate)
      .maybeSingle();
    if (error) {
      throw new ServiceError(`get(${noteDate}): ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data ?? { note_date: noteDate, content: "", updated_at: null, updated_by: null };
  },

  /** Salva (upsert) a nota da data. Só admin/atendente passa pela RLS. */
  async save(noteDate, content) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase
      .from("agenda_notes")
      .upsert({ note_date: noteDate, content, updated_by: actor }, { onConflict: "note_date" })
      .select("note_date, content, updated_at, updated_by")
      .single();
    if (error) {
      throw new ServiceError(`save(${noteDate}): ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return data;
  },
};
