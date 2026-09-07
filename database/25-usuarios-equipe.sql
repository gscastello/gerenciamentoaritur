-- =====================================================================
-- ROTA PIRAPEMAS — 25: GESTÃO DE EQUIPE PELO APP (Sistema)
-- =====================================================================
-- `public.users` (id = auth.users.id, name, phone, role, active) já tem
-- RLS admin para insert/update/delete. Faltava tela + guardas.
--
-- Criar um LOGIN novo precisa do Auth (service_role) → Edge Function
-- `create-user` (supabase/functions/create-user). Aqui só a proteção de
-- não desativar a si mesmo nem o último admin, e a reativação.
--
-- Rodar depois de 01-24. Idempotente.
-- =====================================================================

create or replace function public.rpc_set_user_active(p_id uuid, p_active boolean)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_role user_role; v_admins int;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_id = auth.uid() and p_active = false then
    return jsonb_build_object('success', false, 'message', 'Você não pode desativar a si mesmo.');
  end if;
  select role into v_role from users where id = p_id and deleted_at is null;
  if v_role is null then
    return jsonb_build_object('success', false, 'message', 'Usuário não encontrado.');
  end if;
  if v_role = 'admin' and p_active = false then
    select count(*) into v_admins from users
     where role = 'admin' and active and deleted_at is null and id <> p_id;
    if v_admins = 0 then
      return jsonb_build_object('success', false, 'message', 'Precisa existir pelo menos um admin ativo.');
    end if;
  end if;
  update users set active = p_active, updated_by = auth.uid() where id = p_id;
  return jsonb_build_object('success', true);
end;
$fn$;
revoke execute on function public.rpc_set_user_active(uuid, boolean) from public, anon;
grant  execute on function public.rpc_set_user_active(uuid, boolean) to authenticated, service_role;

create or replace function public.rpc_soft_delete_user(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_role user_role; v_admins int;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_id = auth.uid() then
    return jsonb_build_object('success', false, 'message', 'Você não pode remover a si mesmo.');
  end if;
  select role into v_role from users where id = p_id and deleted_at is null;
  if v_role is null then
    return jsonb_build_object('success', false, 'message', 'Usuário não encontrado.');
  end if;
  if v_role = 'admin' then
    select count(*) into v_admins from users
     where role = 'admin' and active and deleted_at is null and id <> p_id;
    if v_admins = 0 then
      return jsonb_build_object('success', false, 'message', 'Precisa existir pelo menos um admin ativo.');
    end if;
  end if;
  update users set deleted_at = now(), active = false, updated_by = auth.uid() where id = p_id;
  return jsonb_build_object('success', true);
end;
$fn$;
revoke execute on function public.rpc_soft_delete_user(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_user(uuid) to authenticated, service_role;

-- Conferir:
--   select id, name, role, active from users where deleted_at is null order by name;
