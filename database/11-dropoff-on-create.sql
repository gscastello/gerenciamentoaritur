-- =====================================================================
-- ROTA PIRAPEMAS — 11: rpc_create_reservation grava o desembarque estruturado
-- =====================================================================
-- Rodar depois de 03 e 10. O fluxo de Reservar passa a capturar o balde
-- de desembarque (dropoff_area) + o detalhe (dropoff_detail) já no
-- agendamento, então a reserva nasce classificada para a rota do motorista
-- (aba Desembarque da Lista do Dia) em vez de a UI ter que inferir do
-- texto livre.
--
-- Precisa DROP + CREATE: a assinatura ganha 2 parâmetros (no fim, com
-- default null — os chamadores usam parâmetros nomeados, nada quebra).

drop function if exists public.rpc_create_reservation(
  date, trip_direction, text, text, reservation_type, text, integer, numeric,
  payment_method, text, text, text, text, text, text, reservation_status, jsonb, text, uuid
);

create function public.rpc_create_reservation(
  p_trip_date                  date,
  p_direction                  trip_direction,
  p_customer_name               text,
  p_customer_phone              text,
  p_type                        reservation_type default 'passagem',
  p_route_point_code            text default null,
  p_quantity                    integer default 1,
  p_unit_price                  numeric default 0,
  p_payment_method              payment_method default 'dinheiro',
  p_pickup_neighborhood         text default null,
  p_pickup_detail               text default null,
  p_street                      text default null,
  p_reference_point             text default null,
  p_dropoff_location            text default null,
  p_pending_reason              text default null,
  p_status                      reservation_status default 'confirmada',
  p_extra_data                  jsonb default '{}'::jsonb,
  p_whatsapp_source_message_id  text default null,
  p_created_by                  uuid default null,
  p_dropoff_area                text default null,
  p_dropoff_detail              text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id         uuid;
  v_trip_id             uuid;
  v_route_point_id      uuid;
  v_reservation_id      uuid;
  v_default_vehicle_id  uuid;
  v_passenger_status    passenger_status;
  v_i                   integer;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
  end if;

  -- idempotência: reenvio do mesmo webhook do WhatsApp nunca duplica
  if p_whatsapp_source_message_id is not null then
    select id into v_reservation_id from reservations
      where whatsapp_source_message_id = p_whatsapp_source_message_id;
    if v_reservation_id is not null then
      return jsonb_build_object('success', true, 'reservation_id', v_reservation_id,
        'status', (select status from reservations where id = v_reservation_id),
        'message', 'idempotent_replay');
    end if;
  end if;

  -- upsert de cliente por telefone
  select id into v_customer_id from customers where phone = p_customer_phone and deleted_at is null;
  if v_customer_id is null then
    insert into customers (name, phone, default_neighborhood, created_by)
      values (nullif(p_customer_name, ''), p_customer_phone, p_pickup_neighborhood, p_created_by)
      returning id into v_customer_id;
  else
    update customers set
        name = coalesce(nullif(p_customer_name, ''), name),
        default_neighborhood = coalesce(p_pickup_neighborhood, default_neighborhood),
        updated_by = p_created_by
      where id = v_customer_id;
  end if;

  if p_route_point_code is not null then
    select id into v_route_point_id from route_points
      where direction = p_direction and code = p_route_point_code and deleted_at is null;
  end if;

  -- get-or-create da viagem do dia (só reservas de passagem ocupam trip_id)
  if p_type = 'passagem' then
    select id into v_trip_id from trips
      where trip_date = p_trip_date and direction = p_direction and deleted_at is null;
    if v_trip_id is null then
      select id into v_default_vehicle_id from vehicles
        where is_default and active and deleted_at is null limit 1;
      if v_default_vehicle_id is null then
        return jsonb_build_object('success', false, 'message', 'Nenhum veículo padrão configurado.');
      end if;
      insert into trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by)
        select p_trip_date, p_direction, v.id, v.capacity,
               (extract(dow from p_trip_date) = 1 and p_direction = 'ida'), 'agendada', p_created_by
        from vehicles v where v.id = v_default_vehicle_id
        returning id into v_trip_id;
    end if;
  end if;

  insert into reservations (
    trip_id, customer_id, type, status, route_point_id, pickup_neighborhood, pickup_detail,
    street, reference_point, dropoff_location, quantity, unit_price, total_price,
    payment_method, pending_reason, extra_data, whatsapp_source_message_id, created_by,
    dropoff_area, dropoff_detail
  ) values (
    v_trip_id, v_customer_id, p_type, p_status, v_route_point_id, p_pickup_neighborhood, p_pickup_detail,
    p_street, p_reference_point, p_dropoff_location, p_quantity, p_unit_price, p_unit_price * p_quantity,
    p_payment_method, p_pending_reason, p_extra_data, p_whatsapp_source_message_id, p_created_by,
    nullif(trim(p_dropoff_area), ''), nullif(trim(p_dropoff_detail), '')
  ) returning id into v_reservation_id;

  -- reserva confirmada de passagem já nasce ocupando vaga (passa pela trigger de capacidade);
  -- pendente/espera/frete/encomenda nascem sem ocupar (status 'cancelado' até confirmação manual)
  v_passenger_status := case when p_status = 'confirmada' and p_type = 'passagem' then 'confirmado' else 'cancelado' end;

  for v_i in 1..p_quantity loop
    insert into reservation_passengers (reservation_id, seq, status, created_by)
    values (v_reservation_id, v_i, v_passenger_status, p_created_by);
  end loop;

  return jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'status', p_status, 'message', 'created');

exception
  when sqlstate 'P0001' then
    -- a trigger de capacidade recusou — nada foi gravado (rollback automático da função)
    return jsonb_build_object('success', false, 'reservation_id', null, 'status', 'rejected', 'message', SQLERRM);
end;
$$;

revoke execute on function public.rpc_create_reservation(
  date, trip_direction, text, text, reservation_type, text, integer, numeric,
  payment_method, text, text, text, text, text, text, reservation_status, jsonb, text, uuid, text, text
) from public, anon;
grant execute on function public.rpc_create_reservation(
  date, trip_direction, text, text, reservation_type, text, integer, numeric,
  payment_method, text, text, text, text, text, text, reservation_status, jsonb, text, uuid, text, text
) to authenticated, service_role;
