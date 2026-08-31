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

-- ---------------------------------------------------------------------
-- fase 2d: mudar quantidade de passageiros de uma reserva.
-- Aumenta = insere linhas em reservation_passengers (a trigger de
-- capacidade valida; estourou -> rollback + success:false). Diminui =
-- cancela as de maior seq. total_price é acertado aqui; quantity é
-- sincronizada pela trigger fn_sync_reservation_quantity.
create or replace function public.rpc_set_reservation_quantity(
  p_reservation_id uuid, p_quantity integer, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_status  passenger_status;
  v_unit    numeric;
  v_current integer;
  v_max_seq integer;
  v_i       integer;
begin
  if not fn_has_role(array['admin','atendente']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
  end if;
  select unit_price into v_unit from reservations where id = p_reservation_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;
  select count(*), coalesce(max(seq), 0) into v_current, v_max_seq
    from reservation_passengers
    where reservation_id = p_reservation_id and status <> 'cancelado';
  select status into v_status from reservation_passengers
    where reservation_id = p_reservation_id and status <> 'cancelado' order by seq limit 1;
  v_status := coalesce(v_status, 'confirmado');
  if p_quantity > v_current then
    for v_i in 1..(p_quantity - v_current) loop
      insert into reservation_passengers (reservation_id, seq, status, created_by)
      values (p_reservation_id, v_max_seq + v_i, v_status, p_actor);
    end loop;
  elsif p_quantity < v_current then
    update reservation_passengers set status = 'cancelado', updated_by = p_actor
      where id in (
        select id from reservation_passengers
        where reservation_id = p_reservation_id and status <> 'cancelado'
        order by seq desc limit (v_current - p_quantity)
      );
  end if;
  update reservations set total_price = coalesce(v_unit, 0) * p_quantity, updated_by = p_actor
    where id = p_reservation_id;
  return jsonb_build_object('success', true, 'quantity', p_quantity);
exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end $$;
revoke execute on function public.rpc_set_reservation_quantity(uuid, integer, uuid) from public, anon;
grant  execute on function public.rpc_set_reservation_quantity(uuid, integer, uuid) to authenticated, service_role;
