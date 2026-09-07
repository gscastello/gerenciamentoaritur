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

  /** Editar nome / telefone / papel de um usuário (só admin — RLS). */
  async update(userId, fields) {
    return handle(supabase.from("users").update(fields).eq("id", userId).select().single(), "update");
  },

  /** Ativar/desativar (RPC com guarda: nunca o último admin nem a si mesmo). */
  async setActive(userId, active) {
    const { data, error } = await supabase.rpc("rpc_set_user_active", { p_id: userId, p_active: active });
    if (error) throw new ServiceError(`setActive: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível alterar.", { retryable: false });
    return data;
  },

  async remove(userId) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_user", { p_id: userId });
    if (error) throw new ServiceError(`remove: ${error.message}`, { cause: error, retryable: isNetworkish(error) });
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível remover.", { retryable: false });
    return data;
  },

  /**
   * Cria um LOGIN novo para a equipe via Edge Function `create-user`
   * (o Auth exige service_role). O admin passa uma senha temporária; a
   * pessoa troca depois. Sem dependência de SMTP.
   */
  async create({ email, name, role, password }) {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, name, role, password },
    });
    if (error) {
      // erro HTTP da função — tenta extrair a mensagem do corpo
      let msg = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.message) msg = body.message;
      } catch {
        /* usa error.message */
      }
      throw new ServiceError(`create: ${msg}`, { cause: error, retryable: false });
    }
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível criar o login.", { retryable: false });
    return data;
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
