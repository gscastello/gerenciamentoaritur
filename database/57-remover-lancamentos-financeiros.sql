-- =====================================================================
-- ROTA PIRAPEMAS — 57: remover / limpar lançamentos financeiros (#200)
-- =====================================================================
-- Rodar depois de 01–56. Idempotente.
--   1) rpc_remove_financial_entries(p_ids): remove (soft-delete, nunca DELETE)
--      vários lançamentos de uma vez — inclusive os que vêm de RESERVAS e da
--      operação (combustível/manutenção). admin/financeiro. O gatilho
--      trg_audit_financial_entries já grava cada remoção na auditoria.
--      Os fechamentos de caixa (daily_closures) dos dias passados afetados
--      são recalculados, para não ficarem com o valor antigo.
--   2) As automações não "ressuscitam" o que o dono removeu:
--      - receita de reserva: se a receita da reserva foi removida, confirmar/
--        pagar de novo não recria (fn_ensure_reservation_revenue);
--      - custo recorrente: se o lançamento do mês foi removido, o gerador
--        mensal não recria (fn_generate_recurring_expenses).
-- =====================================================================

create or replace function public.rpc_remove_financial_entries(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_removidos integer;
  v_datas     date[];
  v_dia       date;
begin
  if not coalesce(fn_has_role(array['admin','financeiro']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('success', true, 'removed', 0);
  end if;

  with r as (
    update financial_entries
       set deleted_at = now(), updated_by = auth.uid()
     where id = any(p_ids) and deleted_at is null
    returning entry_date
  )
  select count(*), coalesce(array_agg(distinct entry_date), '{}')
    into v_removidos, v_datas
    from r;

  -- dias já fechados (passados) com lançamento removido: refaz o fechamento
  foreach v_dia in array v_datas loop
    if v_dia < current_date
       and exists (select 1 from daily_closures where closure_date = v_dia) then
      perform fn_close_day(v_dia);
    end if;
  end loop;

  return jsonb_build_object('success', true, 'removed', v_removidos);
end;
$fn$;
revoke execute on function public.rpc_remove_financial_entries(uuid[]) from public, anon;
grant  execute on function public.rpc_remove_financial_entries(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Receita de reserva removida pelo dono não volta sozinha (versão do 53 +
-- a trava).
-- ---------------------------------------------------------------------
create or replace function public.fn_ensure_reservation_revenue(
  p_reservation_id uuid,
  p_valor          numeric,
  p_data           date,
  p_actor          uuid,
  p_payment_id     uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_data_viagem date;
begin
  if p_valor is null or p_valor <= 0 then
    return;
  end if;

  -- o dono removeu a receita desta reserva: respeita
  if exists (
    select 1 from financial_entries
     where reservation_id = p_reservation_id
       and type = 'receita' and category = 'passagem' and deleted_at is not null
  ) then
    return;
  end if;

  select t.trip_date into v_data_viagem
    from reservations r
    join trips t on t.id = r.trip_id
    where r.id = p_reservation_id;

  insert into financial_entries (entry_date, type, category, amount, description, reservation_id, payment_id, created_by)
  values (coalesce(v_data_viagem, p_data, current_date), 'receita', 'passagem', p_valor,
          'Receita de reserva confirmada', p_reservation_id, p_payment_id, p_actor)
  on conflict (reservation_id) where type = 'receita' and category = 'passagem' and deleted_at is null
  do nothing;
end;
$$;
revoke execute on function public.fn_ensure_reservation_revenue(uuid, numeric, date, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Custo recorrente removido no mês não é recriado pelo gerador mensal.
-- ---------------------------------------------------------------------
create or replace function public.fn_generate_recurring_expenses(p_template_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  t            record;
  v_entry_date date;
  v_hoje       date := current_date;
  v_count      int  := 0;
  v_mes_ini    date;
  v_ult_dia    int;
  v_dia_efet   int;
begin
  for t in
    select * from recurring_expense_templates
    where active and deleted_at is null
      and (p_template_id is null or id = p_template_id)
  loop
    if t.frequency = 'mensal' then
      v_mes_ini := date_trunc('month', v_hoje)::date;
    else
      if extract(month from v_hoje)::int <> t.due_month then
        continue;
      end if;
      v_mes_ini := make_date(extract(year from v_hoje)::int, t.due_month, 1);
    end if;

    v_ult_dia  := extract(day from (v_mes_ini + interval '1 month - 1 day'))::int;
    v_dia_efet := least(t.due_day, v_ult_dia);

    if extract(day from v_hoje)::int < v_dia_efet then
      continue;
    end if;

    v_entry_date := v_mes_ini + (v_dia_efet - 1);

    -- o dono removeu o lançamento deste custo neste mês: respeita
    if exists (
      select 1 from financial_entries
       where template_id = t.id
         and date_trunc('month', entry_date::timestamp) = date_trunc('month', v_entry_date::timestamp)
         and deleted_at is not null
    ) then
      continue;
    end if;

    insert into financial_entries
      (entry_date, type, category, amount, description, template_id, created_by)
    values
      (v_entry_date, 'despesa', t.category, t.amount,
       coalesce(t.label, 'Custo recorrente'), t.id, t.created_by)
    on conflict (template_id, (date_trunc('month', entry_date::timestamp)))
      where template_id is not null and deleted_at is null
    do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- Conferir:
--   select public.rpc_remove_financial_entries(array['<uuid>']::uuid[]);
--   select count(*) from financial_entries where deleted_at is not null;
