-- =====================================================================
-- ROTA PIRAPEMAS — 30: DIA DO MÊS DO CUSTO RECORRENTE VAI ATÉ 31
-- =====================================================================
-- A aba Gestão → Custos recorrentes limitava o "dia do mês" a 1–28
-- (check + tela) por medo de fevereiro / meses de 30 dias. Corrigido:
--   * o check aceita 1–31;
--   * `fn_generate_recurring_expenses` calcula o "dia efetivo" = min(dia
--     configurado, último dia do mês da competência) — assim dia 31 num
--     mês de 30 dias lança no dia 30, em fevereiro no dia 28/29, e nunca
--     "pula" a competência.
--
-- Rodar depois de 01-29. Idempotente. Não altera lançamentos já gerados.
-- =====================================================================

alter table public.recurring_expense_templates
  drop constraint if exists recurring_expense_templates_due_day_check;
alter table public.recurring_expense_templates
  add  constraint recurring_expense_templates_due_day_check
  check (due_day between 1 and 31);

create or replace function public.fn_generate_recurring_expenses(p_template_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
    else  -- anual: só na competência do mês configurado
      if extract(month from v_hoje)::int <> t.due_month then
        continue;
      end if;
      v_mes_ini := make_date(extract(year from v_hoje)::int, t.due_month, 1);
    end if;

    -- último dia do mês da competência → "dia efetivo" nunca passa dele
    v_ult_dia  := extract(day from (v_mes_ini + interval '1 month - 1 day'))::int;
    v_dia_efet := least(t.due_day, v_ult_dia);

    if extract(day from v_hoje)::int < v_dia_efet then
      continue;  -- ainda não chegou o dia de lançar neste mês
    end if;

    v_entry_date := v_mes_ini + (v_dia_efet - 1);

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
$$;
revoke execute on function public.fn_generate_recurring_expenses(uuid) from public, anon, authenticated;
grant  execute on function public.fn_generate_recurring_expenses(uuid) to service_role;

-- Conferir:
--   select public.fn_generate_recurring_expenses();
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.recurring_expense_templates'::regclass and conname like '%due_day%';
