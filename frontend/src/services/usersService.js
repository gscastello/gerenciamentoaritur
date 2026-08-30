// src/services/usersService.js
import { supabase, ServiceError } from "../lib/supabaseClient";

function isNetworkish(error) { return /fetch|network|timeout/i.test(error?.message || ""); }
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error) throw new ServiceError(`${context}: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
  return data;
}

export const usersService = {
  /** Perfil (nome/papel) do usuário autenticado — usado para saudação e para saber o que a UI deve mostrar/esconder. */
  async getCurrentProfile() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return null;
    return handle(supabase.from("users").select("*").eq("id", authData.user.id).single(), "getCurrentProfile");
  },

  /** Só admin consegue de fato listar/alterar por causa da RLS — a UI deve esconder isso para os demais papéis. */
  async list() {
    return handle(supabase.from("users").select("*").is("deleted_at", null).order("name"), "list");
  },

  async updateRole(userId, role) {
    return handle(supabase.from("users").update({ role }).eq("id", userId).select().single(), "updateRole");
  },

  async signInWithPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ServiceError(`signIn: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new ServiceError(`signOut: ${error.message}`, { cause: error });
  },
};
