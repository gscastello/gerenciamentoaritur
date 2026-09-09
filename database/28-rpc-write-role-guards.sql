-- =====================================================================
-- ROTA PIRAPEMAS — 28: CHECAGEM DE PAPEL NAS RPCs DE ESCRITA (§3.1-B)
-- =====================================================================
-- Estas 8 RPCs são SECURITY DEFINER (precisam ser — a escrita "de
-- verdade" nas tabelas de negócio só passa por RPC, ver 12-write-guards)
-- mas NÃO checavam papel nenhum e confiavam no `p_actor`/`p_created_by`
-- que o cliente mandava. Resultado:
--   * qualquer usuário logado (mesmo `motorista`/`financeiro`) podia
--     chamar /rest/v1/rpc/rpc_cancel_reservation e cancelar qualquer
--     reserva — o bloqueio por papel só existia na tela (TAB_ROLES);
--   * o autor no audit_logs era forjável (o cliente escolhia o UUID).
--
-- Correção, em cada uma:
--   1) guarda no início:
--        if auth.uid() is not null
--           and not coalesce(fn_has_role(<papeis>), false) then
--          return {success:false, ...}
--      — usuário logado precisa do papel; chamada server-side (bot via
--        service_role, pg_cron) tem auth.uid() nulo e passa (é confiável).
--   2) autor = coalesce(auth.uid(), p_actor) — usa o uid real quando há
--      login (não dá pra forjar); só cai no parâmetro para o bot.
--   3) `if not found` depois do UPDATE principal → success:false em vez de
--      "cancelado com sucesso" uma reserva que não existe.
--
-- O advisor 0029 continua listando estas funções (é SECURITY DEFINER +
-- callable por `authenticated` — e precisa ser, o app chama). O risco
-- real (escalar entre papéis / forjar autor) é o que esta migração fecha.
--
-- Assinaturas inalteradas — frontend e bot seguem chamando igual.
-- Rodar depois de 01-27. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- rpc_create_reservation — admin / atendente (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_create_reservation(
  p_trip_date date, p_direction trip_direction, p_customer_name text, p_customer_phone text,
  p_type reservation_type default 'passagem', p_route_point_code text default null,
  p_quantity integer default 1, p_unit_price numeric default 0,
  p_payment_method payment_method default 'dinheiro', p_pickup_neighborhood text default null,
  p_pickup_detail text default null, p_street text default null, p_reference_point text default null,
  p_dropoff_location text default null, p_pending_reason text default null,
  p_status reservation_status default 'confirmada', p_extra_data jsonb default '{}'::jsonb,
  p_whatsapp_source_message_id text default null, p_created_by uuid default null,
  p_dropoff_area text default null, p_dropoff_detail text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_customer_id         uuid;
  v_trip_id             uuid;
  v_route_point_id      uuid;
  v_reservation_id      uuid;
  v_default_vehicle_id  uuid;
  v_passenger_status    passenger_status;
  v_i                   integer;
  v_actor               uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para criar reservas.');
  end if;
  v_actor := coalesce(auth.uid(), p_created_by);

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
  end if;

  if p_whatsapp_source_message_id is not null then
    select id into v_reservation_id from reservations
      where whatsapp_source_message_id = p_whatsapp_source_message_id;
    if v_reservation_id is not null then
      return jsonb_build_object('success', true, 'reservation_id', v_reservation_id,
        'status', (select status from reservations where id = v_reservation_id),
        'message', 'idempotent_replay');
    end if;
  end if;

  select id into v_customer_id from customers where phone = p_customer_phone and deleted_at is null;
  if v_customer_id is null then
    insert into customers (name, phone, default_neighborhood, created_by)
      values (nullif(p_customer_name, ''), p_customer_phone, p_pickup_neighborhood, v_actor)
      returning id into v_customer_id;
  else
    update customers set
        name = coalesce(nullif(p_customer_name, ''), name),
        default_neighborhood = coalesce(p_pickup_neighborhood, default_neighborhood),
        updated_by = v_actor
      where id = v_customer_id;
  end if;

  if p_route_point_code is not null then
    select id into v_route_point_id from route_points
      where direction = p_direction and code = p_route_point_code and deleted_at is null;
  end if;

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
               (extract(dow from p_trip_date) = 1 and p_direction = 'ida'), 'agendada', v_actor
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
    p_payment_method, p_pending_reason, p_extra_data, p_whatsapp_source_message_id, v_actor,
    nullif(trim(p_dropoff_area), ''), nullif(trim(p_dropoff_detail), '')
  ) returning id into v_reservation_id;

  v_passenger_status := case when p_status = 'confirmada' and p_type = 'passagem' then 'confirmado' else 'cancelado' end;

  for v_i in 1..p_quantity loop
    insert into reservation_passengers (reservation_id, seq, status, created_by)
    values (v_reservation_id, v_i, v_passenger_status, v_actor);
  end loop;

  return jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'status', p_status, 'message', 'created');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'reservation_id', null, 'status', 'rejected', 'message', SQLERRM);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_confirm_reservation — admin / atendente (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_confirm_reservation(
  p_reservation_id uuid, p_route_point_code text default null, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_direction        trip_direction;
  v_route_point_id   uuid;
  v_actor            uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  if p_route_point_code is not null then
    select t.direction into v_direction from reservations r join trips t on t.id = r.trip_id where r.id = p_reservation_id;
    select id into v_route_point_id from route_points where direction = v_direction and code = p_route_point_code and deleted_at is null;
    update reservations set route_point_id = v_route_point_id, updated_by = v_actor where id = p_reservation_id;
  end if;

  update reservation_passengers set status = 'confirmado', updated_by = v_actor
    where reservation_id = p_reservation_id and status = 'cancelado';

  update reservations set status = 'confirmada', pending_reason = null, updated_by = v_actor
    where id = p_reservation_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  return jsonb_build_object('success', true, 'message', 'confirmed');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_cancel_reservation — admin / atendente (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_cancel_reservation(
  p_reservation_id uuid, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  update reservation_passengers set status = 'cancelado', updated_by = v_actor where reservation_id = p_reservation_id;
  update reservations set status = 'cancelada', updated_by = v_actor where id = p_reservation_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;
  return jsonb_build_object('success', true, 'message', 'cancelled');
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_move_reservation — admin / atendente (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_move_reservation(
  p_reservation_id uuid, p_new_trip_date date, p_new_direction trip_direction,
  p_new_route_point_code text, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_trip_id             uuid;
  v_route_point_id      uuid;
  v_default_vehicle_id  uuid;
  v_actor               uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  select id into v_trip_id from trips
    where trip_date = p_new_trip_date and direction = p_new_direction and deleted_at is null;
  if v_trip_id is null then
    select id into v_default_vehicle_id from vehicles where is_default and active and deleted_at is null limit 1;
    insert into trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by)
      select p_new_trip_date, p_new_direction, v.id, v.capacity,
             (extract(dow from p_new_trip_date) = 1 and p_new_direction = 'ida'), 'agendada', v_actor
      from vehicles v where v.id = v_default_vehicle_id
      returning id into v_trip_id;
  end if;

  select id into v_route_point_id from route_points
    where direction = p_new_direction and code = p_new_route_point_code and deleted_at is null;

  update reservations set trip_id = v_trip_id, route_point_id = v_route_point_id, updated_by = v_actor
    where id = p_reservation_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  update reservation_passengers set status = status, updated_by = v_actor
    where reservation_id = p_reservation_id and status in ('confirmado', 'embarcado');

  return jsonb_build_object('success', true, 'message', 'moved');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_set_passengers_status — admin / atendente / motorista (+ bot)
-- (o motorista marca embarque na Lista do Dia)
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_passengers_status(
  p_reservation_id uuid, p_status passenger_status, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  update reservation_passengers set status = p_status, updated_by = v_actor
    where reservation_id = p_reservation_id and status <> 'cancelado';

  update reservations set
      status = case p_status when 'embarcado' then 'embarcado'::reservation_status
                              when 'nao_compareceu' then 'nao_compareceu'::reservation_status
                              else status end,
      updated_by = v_actor
    where id = p_reservation_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  return jsonb_build_object('success', true, 'message', 'status_updated');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_start_trip — admin / atendente / motorista (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_start_trip(
  p_trip_id uuid, p_km numeric, p_location text default null, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  update trips set status = 'em_andamento', started_at = now(), start_km = p_km,
      start_location = p_location, updated_by = v_actor
    where id = p_trip_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Viagem não encontrada.');
  end if;
  return jsonb_build_object('success', true);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_finish_trip — admin / atendente / motorista (+ bot)
-- ---------------------------------------------------------------------
create or replace function public.rpc_finish_trip(
  p_trip_id uuid, p_km numeric, p_location text default null, p_actor uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_started timestamptz;
  v_actor   uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  select started_at into v_started from trips where id = p_trip_id;
  update trips set status = 'concluida', finished_at = now(), end_km = p_km, end_location = p_location,
      duration_min = case when v_started is not null then round(extract(epoch from (now() - v_started)) / 60) else null end,
      updated_by = v_actor
    where id = p_trip_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Viagem não encontrada.');
  end if;
  return jsonb_build_object('success', true);
end;
$function$;

-- ---------------------------------------------------------------------
-- rpc_ensure_trips — qualquer papel operacional (rede de segurança da Agenda)
-- ---------------------------------------------------------------------
create or replace function public.rpc_ensure_trips(p_days integer default 14)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_created integer;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista','financeiro']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_created := public.fn_ensure_upcoming_trips(least(greatest(coalesce(p_days, 14), 0), 60));
  return jsonb_build_object('success', true, 'created', v_created);
end;
$function$;

-- Conferir:
--   select proname, (pg_get_functiondef(oid) ~* 'fn_has_role') as guarded
--   from pg_proc where proname in
--    ('rpc_create_reservation','rpc_confirm_reservation','rpc_cancel_reservation',
--     'rpc_move_reservation','rpc_set_passengers_status','rpc_start_trip',
--     'rpc_finish_trip','rpc_ensure_trips');
