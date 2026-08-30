// src/hooks/useUsers.js
import { usersService } from "../services/usersService";
import { useSupabaseQuery } from "./useSupabaseQuery";
import { useAsyncAction } from "./useAsyncAction";

/** Perfil de quem está logado agora — nome e papel (admin/atendente/motorista/financeiro). */
export function useCurrentUser() {
  const query = useSupabaseQuery(() => usersService.getCurrentProfile(), []);
  return { profile: query.data, loading: query.loading, error: query.error, refetch: query.refetch };
}

/** Só retorna dado de verdade para quem tem papel 'admin' — os demais recebem lista vazia por causa da RLS. */
export function useUsersList() {
  const query = useSupabaseQuery(() => usersService.list(), []);
  const updateRole = useAsyncAction(usersService.updateRole);
  return {
    users: query.data ?? [],
    loading: query.loading,
    error: query.error,
    updateRole: async (id, role) => { const r = await updateRole.run(id, role); await query.refetch(); return r; },
  };
}
