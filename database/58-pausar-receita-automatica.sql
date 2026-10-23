-- =====================================================================
-- ROTA PIRAPEMAS — 58: pausar a receita automática das passagens (#204)
-- =====================================================================
-- Rodar depois de 01–57. Idempotente.
--
-- Hoje confirmar ou pagar uma reserva lança a receita sozinha em
-- financial_entries (database/18 + 53 + 57). O dono pediu para PAUSAR isso e
-- lançar à mão por enquanto. Interruptor em settings.auto_revenue
-- ({"enabled": true|false}; sem a chave = ligado, como era). Fica DESLIGADO
-- a partir desta migração; liga/desliga em Sistema → Receita automática.
--
-- Pausado:
--   * confirmar / pagar reserva (passagem ou encomenda) NÃO lança receita;
--   * o que já foi lançado continua como está;
--   * cancelar uma reserva que já tinha receita lançada continua estornando.
-- Ao religar, só as próximas confirmações/pagamentos lançam — as reservas
-- confirmadas durante a pausa NÃO são lançadas retroativamente.
-- =====================================================================

insert into public.settings (key, value)
values ('auto_revenue', '{"enabled": false}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Mesma função do 57 (data da viagem + trava do que o dono removeu) com o
-- interruptor logo na entrada. É o ponto único por onde passam a confirmação
-- (trigger de reserva) e o pagamento (trigger de payments).
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
  -- receita automática pausada pelo dono: lançamento só à mão
  if coalesce((select (value->>'enabled')::boolean from settings where key = 'auto_revenue'), true) is false then
    return;
  end if;

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

-- Conferir:
--   select value from settings where key = 'auto_revenue';   -- {"enabled": false}
--   -- confirmar uma reserva de teste e ver que NÃO surgiu financial_entries novo
