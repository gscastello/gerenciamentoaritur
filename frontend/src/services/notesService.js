// src/services/notesService.js
//
// Bloco de notas livre: notas soltas, sem data obrigatória (tabela
// `notes`, ver database/40-bloco-de-notas-geral.sql). Substitui o bloco
// por-data (agenda_notes) — criar, editar, fixar, apagar.

import { supabase, getCurrentUserId, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}

const COLUNAS = "id, content, pinned, created_at, updated_at, updated_by";

export const notesService = {
  async list() {
    const { data, error } = await supabase
      .from("notes")
      .select(COLUNAS)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) {
      throw new ServiceError(`list(): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data ?? [];
  },

  async create(content = "") {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase
      .from("notes")
      .insert({ content, created_by: actor, updated_by: actor })
      .select(COLUNAS)
      .single();
    if (error) {
      throw new ServiceError(`create(): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data;
  },

  /** patch = { content? , pinned? } */
  async update(id, patch) {
    const actor = await getCurrentUserId();
    const { data, error } = await supabase
      .from("notes")
      .update({ ...patch, updated_by: actor })
      .eq("id", id)
      .select(COLUNAS)
      .single();
    if (error) {
      throw new ServiceError(`update(${id}): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) {
      throw new ServiceError(`remove(${id}): ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    }
  },
};
