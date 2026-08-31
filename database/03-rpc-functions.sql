-- =====================================================================
-- ROTA PIRAPEMAS — FUNÇÕES RPC (chamadas pelo frontend via supabase.rpc())
-- =====================================================================
-- Por que RPC e não INSERT/UPDATE direto do cliente:
--   Criar uma reserva envolve várias tabelas (customers, trips,
--   reservations, reservation_passengers) que precisam ser tratadas como
--   UMA transação. Se o frontend fizesse isso em 4 chamadas separadas,
--   uma falha no meio deixaria dado pela metade, e a checagem de
--   capacidade (que mora no INSERT/UPDATE de reservation_passengers)
--   ficaria fora do controle do restante da operação. Empacotando tudo
--   numa função seguem a MESMA transação da trigger de capacidade
--   definida em supabase-schema.sql: ou tudo entra, ou nada entra.
--
-- IMPORTANTE sobre reservas pendentes/lista de espera: os passageiros são
-- criados com status 'cancelado' (não ocupam vaga) até serem confirmados
-- explicitamente por rpc_confirm_reservation — só nesse momento a trigger
-- de capacidade é de fato testada. Isso corrige, no nível do banco, o
-- mesmo tipo de furo que existia no "mover" da Lista do Dia da versão
-- anterior (reserva pendente nunca ocupa vaga sozinha).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Criar reserva (passagem, frete ou encomenda) — idempotente por
--    whatsapp_source_message_id
-- ---------------------------------------------------------------------
create or replace function rpc_create_reservation(
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
  p_created_by                  uuid default null
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
    payment_method, pending_reason, extra_data, whatsapp_source_message_id, created_by
  ) values (
    v_trip_id, v_customer_id, p_type, p_status, v_route_point_id, p_pickup_neighborhood, p_pickup_detail,
    p_street, p_reference_point, p_dropoff_location, p_quantity, p_unit_price, p_unit_price * p_quantity,
    p_payment_method, p_pending_reason, p_extra_data, p_whatsapp_source_message_id, p_created_by
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

-- ---------------------------------------------------------------------
-- 2) Confirmar reserva pendente / mover da lista de espera para reserva
--    real — é AQUI que a capacidade é testada de verdade para esses casos
-- ---------------------------------------------------------------------
create or replace function rpc_confirm_reservation(
  p_reservation_id     uuid,
  p_route_point_code   text default null,   -- opcional: define o ponto ao confirmar espera "qualquer um"
  p_actor              uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_direction        trip_direction;
  v_route_point_id   uuid;
begin
  if p_route_point_code is not null then
    select t.direction into v_direction from reservations r join trips t on t.id = r.trip_id where r.id = p_reservation_id;
    select id into v_route_point_id from route_points where direction = v_direction and code = p_route_point_code and deleted_at is null;
    update reservations set route_point_id = v_route_point_id, updated_by = p_actor where id = p_reservation_id;
  end if;

  -- flip dos passageiros para 'confirmado' — dispara a trigger de capacidade
  update reservation_passengers set status = 'confirmado', updated_by = p_actor
    where reservation_id = p_reservation_id and status = 'cancelado';

  update reservations set status = 'confirmada', pending_reason = null, updated_by = p_actor
    where id = p_reservation_id;

  return jsonb_build_object('success', true, 'message', 'confirmed');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Recusar pendente / cancelar reserva — nunca falha por capacidade
--    (liberar vaga é sempre uma operação segura)
-- ---------------------------------------------------------------------
create or replace function rpc_cancel_reservation(p_reservation_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update reservation_passengers set status = 'cancelado', updated_by = p_actor where reservation_id = p_reservation_id;
  update reservations set status = 'cancelada', updated_by = p_actor where id = p_reservation_id;
  return jsonb_build_object('success', true, 'message', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Marcar embarcado / não compareceu (todos os passageiros da reserva)
-- ---------------------------------------------------------------------
create or replace function rpc_set_passengers_status(
  p_reservation_id  uuid,
  p_status          passenger_status,
  p_actor           uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update reservation_passengers set status = p_status, updated_by = p_actor
    where reservation_id = p_reservation_id and status <> 'cancelado';

  update reservations set
      status = case p_status when 'embarcado' then 'embarcado'::reservation_status
                              when 'nao_compareceu' then 'nao_compareceu'::reservation_status
                              else status end,
      updated_by = p_actor
    where id = p_reservation_id;

  return jsonb_build_object('success', true, 'message', 'status_updated');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Mover reserva entre viagem/ponto (Lista do Dia) — CORRIGE o bug da
--    V2 em que mover não validava capacidade: aqui o flip força a
--    trigger a reavaliar contra a viagem de destino.
-- ---------------------------------------------------------------------
create or replace function rpc_move_reservation(
  p_reservation_id       uuid,
  p_new_trip_date        date,
  p_new_direction        trip_direction,
  p_new_route_point_code text,
  p_actor                uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id             uuid;
  v_route_point_id      uuid;
  v_default_vehicle_id  uuid;
begin
  select id into v_trip_id from trips
    where trip_date = p_new_trip_date and direction = p_new_direction and deleted_at is null;
  if v_trip_id is null then
    select id into v_default_vehicle_id from vehicles where is_default and active and deleted_at is null limit 1;
    insert into trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by)
      select p_new_trip_date, p_new_direction, v.id, v.capacity,
             (extract(dow from p_new_trip_date) = 1 and p_new_direction = 'ida'), 'agendada', p_actor
      from vehicles v where v.id = v_default_vehicle_id
      returning id into v_trip_id;
  end if;

  select id into v_route_point_id from route_points
    where direction = p_new_direction and code = p_new_route_point_code and deleted_at is null;

  update reservations set trip_id = v_trip_id, route_point_id = v_route_point_id, updated_by = p_actor
    where id = p_reservation_id;

  -- força a trigger a reavaliar capacidade contra a NOVA viagem
  -- (UPDATE OF status dispara mesmo atribuindo o mesmo valor à coluna)
  update reservation_passengers set status = status, updated_by = p_actor
    where reservation_id = p_reservation_id and status in ('confirmado', 'embarcado');

  return jsonb_build_object('success', true, 'message', 'moved');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Iniciar / finalizar viagem (rastreamento — sem GPS/WhatsApp ainda,
--    apenas os timestamps e km que o app já registra hoje)
-- ---------------------------------------------------------------------
create or replace function rpc_start_trip(p_trip_id uuid, p_km numeric, p_location text default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update trips set status = 'em_andamento', started_at = now(), start_km = p_km, start_location = p_location, updated_by = p_actor
    where id = p_trip_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function rpc_finish_trip(p_trip_id uuid, p_km numeric, p_location text default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_started timestamptz;
begin
  select started_at into v_started from trips where id = p_trip_id;
  update trips set status = 'concluida', finished_at = now(), end_km = p_km, end_location = p_location,
      duration_min = case when v_started is not null then round(extract(epoch from (now() - v_started)) / 60) else null end,
      updated_by = p_actor
    where id = p_trip_id;
  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
-- ATENÇÃO: estas funções são SECURITY DEFINER — rodam como o dono e
-- IGNORAM o RLS das tabelas por baixo. Portanto a barreira de acesso é
-- QUEM pode executá-las:
--   - 'anon' (chave pública do site/bot no navegador): NÃO pode. Sem isso,
--     qualquer pessoa com a anon key criaria/cancelaria reservas.
--   - 'authenticated' (funcionário logado no painel): pode.
--   - 'service_role' (backend do bot do WhatsApp, chave de servidor): pode.
-- A distinção fina de papel (atendente x financeiro x motorista) é feita
-- na aplicação e reforçada pelo RLS nas LEITURAS (views/tabelas).
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'rpc_create_reservation','rpc_confirm_reservation','rpc_cancel_reservation',
      'rpc_set_passengers_status','rpc_move_reservation','rpc_start_trip','rpc_finish_trip')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
