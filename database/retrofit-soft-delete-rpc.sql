-- retrofit-soft-delete-rpc.sql
--
-- PROBLEMA
-- Nesta instância do Postgres, a expressão USING de uma policy de SELECT
-- também é checada como WITH CHECK na linha resultante de um UPDATE. Como
-- as policies de SELECT filtravam `deleted_at IS NULL`, todo soft-delete
-- (UPDATE ... SET deleted_at = now()) feito pelo usuário autenticado era
-- recusado com "new row violates row-level security policy".
--
-- POR QUE ESTE ARQUIVO (e não o retrofit-soft-delete-rls.sql)
-- Mexer nas policies exige ser OWNER das tabelas — e o SQL Editor dá
-- "must be owner of relation ...". Criar FUNÇÃO só precisa de CREATE no
-- schema (que o papel do editor tem — já existem 7 funções rpc_*). Então
-- a saída é: funções SECURITY DEFINER de soft-delete, que rodam com o
-- dono e não passam pela RLS. Mesmo padrão das rpc_* de reserva.
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.

-- lançamento financeiro (Financeiro) --------------------------------
create or replace function public.rpc_soft_delete_financial_entry(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update financial_entries
     set deleted_at = now(), updated_by = auth.uid()
   where id = p_id and deleted_at is null and fuel_record_id is null and maintenance_id is null;
  return jsonb_build_object('success', true);
end $$;
revoke execute on function public.rpc_soft_delete_financial_entry(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_financial_entry(uuid) to authenticated, service_role;

-- registro de combustível (Operação — fase 2c) ---------------------
create or replace function public.rpc_soft_delete_fuel_record(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  -- a despesa correspondente em financial_entries some junto
  update financial_entries set deleted_at = now(), updated_by = auth.uid()
    where fuel_record_id = p_id and deleted_at is null;
  update fuel_records set deleted_at = now(), updated_by = auth.uid()
    where id = p_id and deleted_at is null;
  return jsonb_build_object('success', true);
end $$;
revoke execute on function public.rpc_soft_delete_fuel_record(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_fuel_record(uuid) to authenticated, service_role;

-- manutenção preventiva (Operação — fase 2c) ----------------------
create or replace function public.rpc_soft_delete_maintenance(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update financial_entries set deleted_at = now(), updated_by = auth.uid()
    where maintenance_id = p_id and deleted_at is null;
  update maintenance set deleted_at = now(), updated_by = auth.uid()
    where id = p_id and deleted_at is null;
  return jsonb_build_object('success', true);
end $$;
revoke execute on function public.rpc_soft_delete_maintenance(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_maintenance(uuid) to authenticated, service_role;

-- motorista (Operação — fase 2c) ---------------------------------
create or replace function public.rpc_soft_delete_driver(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not fn_has_role(array['admin','atendente']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update drivers set deleted_at = now(), updated_by = auth.uid()
    where id = p_id and deleted_at is null;
  return jsonb_build_object('success', true);
end $$;
revoke execute on function public.rpc_soft_delete_driver(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_driver(uuid) to authenticated, service_role;
