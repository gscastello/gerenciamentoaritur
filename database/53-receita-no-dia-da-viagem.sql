-- =====================================================================
-- ROTA PIRAPEMAS — 53: receita da reserva entra no DIA DA VIAGEM
-- =====================================================================
-- Rodar depois de 01–52. Issue #185.
--
-- Problema: a receita de uma reserva confirmada era gravada em
-- financial_entries com entry_date = current_date (o dia em que a reserva
-- foi FEITA). Uma reserva feita hoje para a viagem de sexta caía no caixa
-- de hoje, não no de sexta. Agora a data é a da viagem (trips.trip_date).
--
-- Regras:
--   * receita (confirmação ou pagamento, o que vier primeiro) -> data da
--     viagem; sem viagem (ex.: encomenda ainda não encaixada) -> a data
--     passada pelo chamador, e por último hoje;
--   * estorno automático por cancelamento -> mesma data da receita quando
--     a viagem ainda não aconteceu (anula a receita no próprio dia);
--     se a receita já é de dia passado, o estorno é de hoje (o caixa
--     desse dia pode já ter sido fechado — nunca reescrevemos o passado);
--   * ajuste manual (rpc_register_financial_adjustment) continua em hoje:
--     é movimento de caixa que acontece no dia em que é registrado.
-- =====================================================================

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

create or replace function public.fn_reservation_cancelled_to_reversal() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_receita_id     uuid;
  v_receita_valor  numeric;
  v_receita_data   date;
  v_ja_estornado   boolean;
begin
  if NEW.status is distinct from 'cancelada' or OLD.status = 'cancelada' then
    return NEW; -- só na transição PARA cancelada
  end if;

  select id, amount, entry_date into v_receita_id, v_receita_valor, v_receita_data
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
        greatest(v_receita_data, current_date), 'despesa', 'estorno', v_receita_valor,
        'Estorno automático — reserva cancelada', NEW.id, v_receita_id, NEW.updated_by
      );
    end if;
  end if;

  update payments set status = 'estornado', updated_by = NEW.updated_by, updated_at = now()
    where reservation_id = NEW.id and status = 'pago' and deleted_at is null;

  return NEW;
end;
$$;
revoke execute on function public.fn_reservation_cancelled_to_reversal() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Reserva remarcada (outra data/viagem): a receita acompanha a nova data.
-- Só mexe em lançamento que ainda não aconteceu (entry_date >= hoje) e só
-- quando a nova viagem também não é passada — o passado nunca é reescrito.
-- ---------------------------------------------------------------------
create or replace function public.fn_reservation_moved_revenue_date() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nova_data date;
begin
  if NEW.trip_id is not distinct from OLD.trip_id or NEW.trip_id is null then
    return NEW;
  end if;
  select trip_date into v_nova_data from trips where id = NEW.trip_id;
  if v_nova_data is null or v_nova_data < current_date then
    return NEW;
  end if;
  update financial_entries
     set entry_date = v_nova_data
   where reservation_id = NEW.id
     and category in ('passagem', 'estorno')
     and type in ('receita', 'despesa')
     and entry_date >= current_date
     and deleted_at is null;
  return NEW;
end;
$$;
revoke execute on function public.fn_reservation_moved_revenue_date() from public, anon, authenticated;

drop trigger if exists trg_reservation_moved_revenue_date on public.reservations;
create trigger trg_reservation_moved_revenue_date
  after update of trip_id on public.reservations
  for each row execute function public.fn_reservation_moved_revenue_date();

-- ---------------------------------------------------------------------
-- Corrige o que já está lançado: só receitas de viagens que AINDA NÃO
-- aconteceram (trip_date >= hoje). Dias passados ficam como estão — o
-- fechamento de caixa deles (daily_closures) já foi calculado.
-- Os estornos automáticos ligados a essas receitas acompanham a data.
-- ---------------------------------------------------------------------
with alvo as (
  select fe.id, t.trip_date
  from financial_entries fe
  join reservations r on r.id = fe.reservation_id
  join trips t on t.id = r.trip_id
  where fe.type = 'receita' and fe.category = 'passagem' and fe.deleted_at is null
    and t.trip_date >= current_date
    and fe.entry_date is distinct from t.trip_date
), movidas as (
  update financial_entries fe
     set entry_date = alvo.trip_date
    from alvo
   where fe.id = alvo.id
  returning fe.id, fe.entry_date
)
update financial_entries est
   set entry_date = movidas.entry_date
  from movidas
 where est.entrada_ajustada_id = movidas.id
   and est.type = 'despesa' and est.category = 'estorno'
   and est.deleted_at is null;

-- Conferir:
--   select fe.entry_date, t.trip_date, fe.amount
--     from financial_entries fe
--     join reservations r on r.id = fe.reservation_id
--     join trips t on t.id = r.trip_id
--    where fe.type = 'receita' and fe.category = 'passagem' and fe.deleted_at is null
--    order by t.trip_date;
