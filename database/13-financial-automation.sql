-- =====================================================================
-- AUTOMACAO FINANCEIRA -- parte 1: pagamento + receita + fechamento diario
-- =====================================================================
-- Aplicado e testado em producao em 2026-09-02 via Supabase MCP, dentro
-- de transacoes revertidas (BEGIN...ROLLBACK) com dado real.
--
-- Solucao 1: reserva de passagem cria sozinha o registro de pagamento
-- pendente (antes a tabela payments ficava orfa -- nada a populava).
-- Solucao 2: quando o pagamento vira 'pago', a receita nasce sozinha em
-- financial_entries -- mesmo padrao ja usado para combustivel/manutencao,
-- com protecao contra lancamento duplicado.
-- Solucao 4/5: fechamento de caixa diario automatico (pg_cron, 00:05) e
-- resumo mensal sempre atualizado (view em cima dos fechamentos diarios).
-- =====================================================================

create or replace function fn_reservation_to_payment()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if NEW.type = 'passagem' and NEW.total_price is not null and NEW.total_price > 0 then
    insert into payments (reservation_id, amount, method, status, created_by)
    values (NEW.id, NEW.total_price, NEW.payment_method, 'pendente', NEW.created_by);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reservation_to_payment on reservations;
create trigger trg_reservation_to_payment
  after insert on reservations
  for each row execute function fn_reservation_to_payment();

create or replace function fn_sync_payment_amount()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if NEW.total_price is distinct from OLD.total_price and NEW.type = 'passagem' then
    update payments set amount = NEW.total_price, updated_at = now()
      where reservation_id = NEW.id and status = 'pendente';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_payment_amount on reservations;
create trigger trg_sync_payment_amount
  after update of total_price on reservations
  for each row execute function fn_sync_payment_amount();

alter table financial_entries add column if not exists payment_id uuid references payments(id);
create unique index if not exists uq_financial_entries_payment
  on financial_entries (payment_id) where payment_id is not null and deleted_at is null;

create or replace function fn_payment_to_financial_entry()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if NEW.status = 'pago' and (OLD.status is distinct from 'pago') then
    insert into financial_entries (entry_date, type, category, amount, description, reservation_id, payment_id, created_by)
    values (coalesce(NEW.paid_at::date, current_date), 'receita', 'passagem', NEW.amount,
              'Pagamento de reserva confirmado', NEW.reservation_id, NEW.id, NEW.updated_by)
    on conflict (payment_id) where payment_id is not null and deleted_at is null do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_payment_financial_entry on payments;
create trigger trg_payment_financial_entry
  after update of status on payments
  for each row execute function fn_payment_to_financial_entry();

-- backfill: reservas criadas antes desta migracao ganham seu payment agora
insert into payments (reservation_id, amount, method, status)
select r.id, r.total_price, r.payment_method, 'pendente'
from reservations r
where r.type = 'passagem' and r.deleted_at is null and r.total_price > 0
  and not exists (select 1 from payments p where p.reservation_id = r.id);

create table if not exists daily_closures (
    closure_date    date primary key,
    total_revenue   numeric(10,2) not null,
    total_expenses  numeric(10,2) not null,
    net_profit      numeric(10,2) not null,
    entries_count   integer not null,
    closed_at       timestamptz not null default now()
  );

alter table daily_closures enable row level security;
drop policy if exists daily_closures_select on daily_closures;
create policy daily_closures_select on daily_closures for select
  using (fn_has_role(array['admin','financeiro']::user_role[]));

create or replace function fn_close_day(p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rev numeric; v_exp numeric; v_count int;
begin
  select coalesce(sum(amount) filter (where type = 'receita'), 0),
         coalesce(sum(amount) filter (where type = 'despesa'), 0),
         count(*)
    into v_rev, v_exp, v_count
    from financial_entries
    where entry_date = p_date and deleted_at is null;

  insert into daily_closures (closure_date, total_revenue, total_expenses, net_profit, entries_count)
  values (p_date, v_rev, v_exp, v_rev - v_exp, v_count)
  on conflict (closure_date) do update
    set total_revenue = excluded.total_revenue,
        total_expenses = excluded.total_expenses,
        net_profit = excluded.net_profit,
        entries_count = excluded.entries_count,
        closed_at = now();
end;
$$;

create or replace function fn_close_previous_day() returns void
language plpgsql set search_path to 'public' as $$
begin
  perform fn_close_day(current_date - 1);
end;
$$;

select cron.schedule('daily-cash-closure', '5 0 * * *', 'select fn_close_previous_day();');

-- security_invoker: a view precisa respeitar a RLS de daily_closures
-- (admin/financeiro), nao rodar com privilegio de quem a criou.
create or replace view v_monthly_financial_summary
with (security_invoker = true)
as
select
  date_trunc('month', closure_date)::date as month,
  sum(total_revenue)   as total_revenue,
  sum(total_expenses)  as total_expenses,
  sum(net_profit)       as net_profit,
  sum(entries_count)    as entries_count
from daily_closures
group by 1
order by 1 desc;
