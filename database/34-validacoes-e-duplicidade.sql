-- =====================================================================
-- ROTA PIRAPEMAS — 34: VALIDAÇÕES + ANTI-DUPLICIDADE em rpc_create_reservation
-- =====================================================================
-- Reforço no backend das mesmas regras que o frontend já checa
-- (domain/validacao.js): telefone, data no passado, valor, nome.
--
-- Anti-duplicidade: clique duplo em "Agendar" / reenvio → uma reserva
-- de passagem IDÊNTICA (mesmo cliente + viagem + ponto) criada nos
-- últimos 90 s é ignorada (devolve a que já existe, success:true).
--
-- Rodar depois de 01-33. Idempotente (create or replace).
-- =====================================================================

create or replace function public.rpc_create_reservation(
  p_trip_date date, p_direction trip_direction, p_customer_name text, p_customer_phone text,
  p_type reservation_type default 'passagem'::reservation_type,
  p_route_point_code text default null, p_quantity integer default 1,
  p_unit_price numeric default 0, p_payment_method payment_method default 'dinheiro'::payment_method,
  p_pickup_neighborhood text default null, p_pickup_detail text default null,
  p_street text default null, p_reference_point text default null, p_dropoff_location text default null,
  p_pending_reason text default null, p_status reservation_status default 'confirmada'::reservation_status,
  p_extra_data jsonb default '{}'::jsonb, p_whatsapp_source_message_id text default null,
  p_created_by uuid default null, p_dropoff_area text default null, p_dropoff_detail text default null
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
  v_dup                 uuid;
  v_fone_digitos        text;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para criar reservas.');
  end if;
  v_actor := coalesce(auth.uid(), p_created_by);

  -- ---- validações (espelham domain/validacao.js) ----
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
  end if;
  if coalesce(p_unit_price, 0) < 0 then
    return jsonb_build_object('success', false, 'message', 'Valor inválido.');
  end if;
  v_fone_digitos := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  if length(v_fone_digitos) < 10 or length(v_fone_digitos) > 13 then
    return jsonb_build_object('success', false, 'message', 'Telefone inválido (informe DDD + número).');
  end if;
  if p_type = 'passagem' then
    if coalesce(btrim(p_customer_name), '') = '' then
      return jsonb_build_object('success', false, 'message', 'Nome do passageiro é obrigatório.');
    end if;
    if p_trip_date is null or p_trip_date < current_date - 1 then
      return jsonb_build_object('success', false, 'message', 'Data da viagem no passado — verifique a data.');
    end if;
  end if;

  -- idempotência do webhook do WhatsApp
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

    -- ---- anti-duplicidade (clique duplo / reenvio) ----
    if p_whatsapp_source_message_id is null then
      select id into v_dup from reservations
        where customer_id = v_customer_id
          and trip_id = v_trip_id
          and coalesce(route_point_id::text, '') = coalesce(v_route_point_id::text, '')
          and status <> 'cancelada'
          and deleted_at is null
          and created_at > now() - interval '90 seconds'
        limit 1;
      if v_dup is not null then
        return jsonb_build_object('success', true, 'reservation_id', v_dup,
          'status', (select status from reservations where id = v_dup),
          'message', 'duplicate_ignored');
      end if;
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

revoke execute on function public.rpc_create_reservation(date,trip_direction,text,text,reservation_type,text,integer,numeric,payment_method,text,text,text,text,text,text,reservation_status,jsonb,text,uuid,text,text)
  from public, anon;
grant execute on function public.rpc_create_reservation(date,trip_direction,text,text,reservation_type,text,integer,numeric,payment_method,text,text,text,text,text,text,reservation_status,jsonb,text,uuid,text,text)
  to authenticated, service_role;

-- Conferir:
--   select public.rpc_create_reservation('2020-01-01','ida','Fulano','98999999999');  -- data no passado
--   select public.rpc_create_reservation(current_date,'ida','Fulano','123');          -- telefone inválido
