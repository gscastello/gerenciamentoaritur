-- =====================================================================
-- ROTA PIRAPEMAS — 19: Gestão Operacional (custos empresariais + automação)
-- =====================================================================
-- Rodar depois de 01–18.
--
-- Por quê: a aba Financeiro é o caixa do dia. Mas a empresa tem custos
-- fixos/recorrentes que não passam pelo caixa diário — salários, pró-
-- labore, impostos, taxas bancárias/cartão, seguro, IPVA, pneus, lavagem,
-- peças, depreciação, despesas administrativas, manutenção corretiva e
-- outras despesas recorrentes. Aqui esses custos são:
--   1) cadastrados uma vez como "custo recorrente" (mensal ou anual);
--   2) lançados sozinhos toda competência por um job (pg_cron);
--   3) 100% editáveis à mão depois — a linha gerada é um financial_entries
--      comum (aparece em Financeiro e nos Lançamentos da Gestão), pode
--      editar o valor, a data ou apagar. Nada fica preso na automação.
--
-- "Resultado líquido" = TODAS as receitas − TODAS as despesas da
-- competência (as 14 categorias abaixo + combustível/manutenção/
-- alimentação/motorista que já entram por trigger).

-- ---------------------------------------------------------------------
-- 1) Templates de custo recorrente.
--    category: texto livre em financial_entries, mas a tela/automação só
--    usam estas 14. O check-constraint garante isso na origem.
-- ---------------------------------------------------------------------
create table if not exists public.recurring_expense_templates (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in (
                 'salario','pro_labore','imposto','taxa_bancaria','taxa_cartao',
                 'seguro','ipva','pneu','lavagem','peca','depreciacao',
                 'despesa_administrativa','manutencao_corretiva','outro_recorrente')),
  label        text not null,
  amount       numeric(10,2) not null check (amount > 0),
  frequency    text not null check (frequency in ('mensal','anual')),
  due_day      int not null default 1 check (due_day between 1 and 28),
  due_month    int check (due_month between 1 and 12),  -- obrigatório só p/ anual
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  updated_by   uuid references public.users(id),
  deleted_at   timestamptz,
  constraint chk_anual_tem_mes check (frequency <> 'anual' or due_month is not null)
);
create index if not exists idx_recurring_templates_active
  on public.recurring_expense_templates (active) where deleted_at is null;
drop trigger if exists trg_recurring_templates_updated_at on public.recurring_expense_templates;
create trigger trg_recurring_templates_updated_at before update
  on public.recurring_expense_templates
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2) Liga o lançamento gerado ao template + trava anti-duplicidade:
--    no máximo 1 lançamento por template por competência (mês).
--    date_trunc(..., ::timestamp) => timestamp SEM fuso => IMMUTABLE,
--    pode entrar no índice.
-- ---------------------------------------------------------------------
alter table public.financial_entries
  add column if not exists template_id uuid references public.recurring_expense_templates(id);

create unique index if not exists uq_financial_entries_template_competencia
  on public.financial_entries (template_id, (date_trunc('month', entry_date::timestamp)))
  where template_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------
-- 3) RLS: mesma regra do financial_entries (admin/financeiro).
-- ---------------------------------------------------------------------
alter table public.recurring_expense_templates enable row level security;

drop policy if exists recurring_templates_select on public.recurring_expense_templates;
create policy recurring_templates_select on public.recurring_expense_templates for select
  using (fn_has_role(array['admin','financeiro']::user_role[]) and deleted_at is null);

drop policy if exists recurring_templates_insert on public.recurring_expense_templates;
create policy recurring_templates_insert on public.recurring_expense_templates for insert
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

drop policy if exists recurring_templates_update on public.recurring_expense_templates;
create policy recurring_templates_update on public.recurring_expense_templates for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

revoke delete on public.recurring_expense_templates from authenticated, anon;

-- ---------------------------------------------------------------------
-- 4) Geração automática. Idempotente via a trava do passo 2.
--    p_template_id null = roda para todos (uso do cron).
--    Retorna quantos lançamentos foram criados nesta chamada.
-- ---------------------------------------------------------------------
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
begin
  for t in
    select * from recurring_expense_templates
    where active and deleted_at is null
      and (p_template_id is null or id = p_template_id)
  loop
    if t.frequency = 'mensal' then
      if extract(day from v_hoje)::int < t.due_day then
        continue;  -- ainda não chegou o dia de lançar neste mês
      end if;
      v_entry_date := date_trunc('month', v_hoje)::date + (t.due_day - 1);
    else  -- anual
      if extract(month from v_hoje)::int <> t.due_month
         or extract(day from v_hoje)::int < t.due_day then
        continue;
      end if;
      v_entry_date := make_date(extract(year from v_hoje)::int, t.due_month, t.due_day);
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
$$;
revoke execute on function public.fn_generate_recurring_expenses(uuid) from public, anon, authenticated;
grant  execute on function public.fn_generate_recurring_expenses(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 5) Cron diário 06:40 UTC (~03:40 São Luís) — depois do fechamento de
--    caixa (00:05) e do backup (06:00). cron.schedule faz upsert pelo
--    nome do job, então rodar a migração de novo só re-agenda.
-- ---------------------------------------------------------------------
select cron.schedule('gerar-custos-recorrentes', '40 6 * * *',
  $cron$ select public.fn_generate_recurring_expenses(); $cron$);

-- ---------------------------------------------------------------------
-- 6) "Gerar agora" da tela (admin/financeiro).
-- ---------------------------------------------------------------------
create or replace function public.rpc_run_recurring_expenses()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_count int;
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_count := fn_generate_recurring_expenses();
  return jsonb_build_object('success', true, 'gerados', v_count);
end;
$$;
revoke execute on function public.rpc_run_recurring_expenses() from public, anon;
grant  execute on function public.rpc_run_recurring_expenses() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Soft-delete do template (RLS recusa UPDATE direto de deleted_at —
--    mesmo motivo de retrofit-soft-delete-rpc.sql).
-- ---------------------------------------------------------------------
create or replace function public.rpc_soft_delete_recurring_template(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update recurring_expense_templates
     set deleted_at = now(), active = false, updated_by = auth.uid()
   where id = p_id and deleted_at is null;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_soft_delete_recurring_template(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_recurring_template(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8) Realtime na nova tabela (a tela reage sem refresh).
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.recurring_expense_templates;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select * from recurring_expense_templates order by category;
--   select public.fn_generate_recurring_expenses();  -- roda manual
--   select type, category, amount, template_id, entry_date from financial_entries
--     where template_id is not null order by entry_date desc;
