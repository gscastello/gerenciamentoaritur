-- =====================================================================
-- ROTA PIRAPEMAS — 18: Receita automática (confirmação/pagamento),
-- estorno no cancelamento e módulo de contas a receber
-- =====================================================================
-- Rodar depois de 01–17.

-- ---------------------------------------------------------------------
-- 1) Liga um ajuste (estorno/reembolso/ajuste) ao lançamento original —
--    o original NUNCA é apagado nem alterado, o ajuste é uma linha nova.
-- ---------------------------------------------------------------------
alter table public.financial_entries
  add column if not exists entrada_ajustada_id uuid references public.financial_entries(id);

-- Uma reserva só pode ter UMA receita "de passagem" original — o ponto de
-- dedup que o resto desta migração usa (ON CONFLICT). Confirmar OU pagar,
-- o que vier primeiro, grava; o outro caminho vira no-op.
create unique index if not exists uq_financial_entries_reservation_receita
  on public.financial_entries (reservation_id)
  where type = 'receita' and category = 'passagem' and deleted_at is null;

-- ---------------------------------------------------------------------
-- 2) Função compartilhada: garante a receita da reserva (idempotente).
--    Chamada tanto pela confirmação quanto pelo pagamento.
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
begin
  if p_valor is null or p_valor <= 0 then
    return;
  end if;
  insert into financial_entries (entry_date, type, category, amount, description, reservation_id, payment_id, created_by)
  values (coalesce(p_data, current_date), 'receita', 'passagem', p_valor,
          'Receita de reserva confirmada', p_reservation_id, p_payment_id, p_actor)
  on conflict (reservation_id) where type = 'receita' and category = 'passagem' and deleted_at is null
  do nothing;
end;
$$;
revoke execute on function public.fn_ensure_reservation_revenue(uuid, numeric, date, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Reserva CONFIRMADA (ou já criada confirmada) gera a receita sozinha
--    — não precisa esperar o pagamento. "toda reserva confirmada/paga".
-- ---------------------------------------------------------------------
create or replace function public.fn_reservation_confirmed_to_revenue() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if NEW.type = 'passagem'
     and NEW.status in ('confirmada', 'embarcado')
     and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    perform fn_ensure_reservation_revenue(
      NEW.id, NEW.total_price, current_date, coalesce(NEW.updated_by, NEW.created_by)
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reservation_confirmed_to_revenue on public.reservations;
create trigger trg_reservation_confirmed_to_revenue
  after insert or update of status on public.reservations
  for each row execute function public.fn_reservation_confirmed_to_revenue();

-- ---------------------------------------------------------------------
-- 4) O gatilho de pagamento (já existente, database/13-financial-automation.sql)
--    passa a usar a MESMA função — dedup por reservation_id, não só por
--    payment_id. Confirmar e pagar, o que vier primeiro, grava.
-- ---------------------------------------------------------------------
create or replace function public.fn_payment_to_financial_entry() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if NEW.status = 'pago' and (OLD.status is distinct from 'pago') then
    perform fn_ensure_reservation_revenue(
      NEW.reservation_id, NEW.amount, coalesce(NEW.paid_at::date, current_date), NEW.updated_by, NEW.id
    );
  end if;
  return NEW;
end;
$$;
-- (o trigger trg_payment_financial_entry de 13-financial-automation.sql já
-- existe e chama esta função — não precisa recriar o trigger em si)

-- ---------------------------------------------------------------------
-- 5) CANCELAMENTO: estorna automaticamente sem apagar o histórico. Se
--    tinha pagamento 'pago', ele também vira 'estornado'.
-- ---------------------------------------------------------------------
create or replace function public.fn_reservation_cancelled_to_reversal() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_receita_id     uuid;
  v_receita_valor  numeric;
  v_ja_estornado   boolean;
begin
  if NEW.status is distinct from 'cancelada' or OLD.status = 'cancelada' then
    return NEW; -- só na transição PARA cancelada
  end if;

  select id, amount into v_receita_id, v_receita_valor
    from financial_entries
    where reservation_id = NEW.id and type = 'receita' and category = 'passagem' and deleted_at is null
    limit 1;

  if v_receita_id is not null then
    select exists(
      select 1 from financial_entries
      where entrada_ajustada_id = v_receita_id and deleted_at is null
    ) into v_ja_estornado;

    if not v_ja_estornado then
      insert into financial_entries (
        entry_date, type, category, amount, description, reservation_id, entrada_ajustada_id, created_by
      ) values (
        current_date, 'despesa', 'estorno', v_receita_valor,
        'Estorno automático — reserva cancelada', NEW.id, v_receita_id, NEW.updated_by
      );
    end if;
  end if;

  update payments set status = 'estornado', updated_by = NEW.updated_by, updated_at = now()
    where reservation_id = NEW.id and status = 'pago' and deleted_at is null;

  return NEW;
end;
$$;

drop trigger if exists trg_reservation_cancelled_to_reversal on public.reservations;
create trigger trg_reservation_cancelled_to_reversal
  after update of status on public.reservations
  for each row execute function public.fn_reservation_cancelled_to_reversal();

-- ---------------------------------------------------------------------
-- 6) Registro manual de estorno/reembolso/ajuste (ex.: devolveu em
--    dinheiro depois de já ter passado pelo caixa). admin/financeiro.
-- ---------------------------------------------------------------------
create or replace function public.rpc_register_financial_adjustment(
  p_reservation_id uuid,
  p_categoria      text,   -- 'estorno' | 'reembolso' | 'ajuste'
  p_valor          numeric,
  p_descricao      text default null,
  p_actor          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_original_id uuid;
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Só admin/financeiro pode registrar ajuste.');
  end if;
  if p_categoria not in ('estorno','reembolso','ajuste') then
    return jsonb_build_object('success', false, 'message', 'Categoria inválida.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('success', false, 'message', 'Valor inválido.');
  end if;

  select id into v_original_id from financial_entries
    where reservation_id = p_reservation_id and type = 'receita' and category = 'passagem' and deleted_at is null
    limit 1;

  insert into financial_entries (
    entry_date, type, category, amount, description, reservation_id, entrada_ajustada_id, created_by
  ) values (
    current_date, 'despesa', p_categoria, p_valor,
    coalesce(p_descricao, initcap(p_categoria) || ' manual'), p_reservation_id, v_original_id, p_actor
  );

  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_register_financial_adjustment(uuid, text, numeric, text, uuid) from public, anon;
grant  execute on function public.rpc_register_financial_adjustment(uuid, text, numeric, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Contas a receber: passageiros com reserva ativa e pagamento ainda
--    não confirmado.
-- ---------------------------------------------------------------------
create or replace view public.v_contas_a_receber with (security_invoker = on) as
select
  r.id                as reservation_id,
  c.id                as customer_id,
  c.name              as nome,
  c.phone             as telefone,
  r.total_price       as valor_devido,
  t.trip_date         as vencimento,
  p.id                as payment_id,
  coalesce(p.status, 'pendente') as status_pagamento,
  p.method            as forma_pagamento,
  r.created_at        as criado_em
from reservations r
join customers c on c.id = r.customer_id
left join trips t on t.id = r.trip_id
left join payments p on p.reservation_id = r.id and p.deleted_at is null
where r.type = 'passagem'
  and r.status in ('confirmada', 'embarcado')
  and r.deleted_at is null
  and (p.status is null or p.status = 'pendente');

revoke all    on public.v_contas_a_receber from anon;
grant  select on public.v_contas_a_receber to authenticated;

-- Conferir:
--   select * from v_contas_a_receber order by vencimento;
--   select type, category, amount, entrada_ajustada_id from financial_entries
--     where reservation_id = '<uuid de teste>' order by created_at;
