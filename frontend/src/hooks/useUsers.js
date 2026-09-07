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
  const update = useAsyncAction(usersService.update);
  const setActive = useAsyncAction(usersService.setActive);
  const remove = useAsyncAction(usersService.remove);
  const create = useAsyncAction(usersService.create);
  const after = async (p) => { const r = await p; await query.refetch(); return r; };
  return {
    users: query.data ?? [],
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    updateRole: (id, role) => after(updateRole.run(id, role)),
    updateUser: (id, fields) => after(update.run(id, fields)),
    setActive: (id, active) => after(setActive.run(id, active)),
    removeUser: (id) => after(remove.run(id)),
    createUser: (fields) => after(create.run(fields)),
    salvando: updateRole.loading || update.loading || setActive.loading || remove.loading || create.loading,
  };
}
