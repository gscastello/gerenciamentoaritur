-- =====================================================================
-- ROTA PIRAPEMAS — 63: impedir reserva duplicada na mesma viagem (#216)
-- =====================================================================
-- Rodar depois de 01–62. Idempotente.
-- Antes só havia trava para o mesmo contato + mesmo ponto em até 90 s. As
-- duplicatas reais vinham da anotação rápida, horas depois e/ou em outro ponto
-- da mesma viagem (ex.: Buscar em casa + Retorno, ambas confirmadas).
-- Agora rpc_create_reservation RECUSA a passagem quando o mesmo contato (ou, sem
-- telefone, o mesmo nome) já tem passagem ativa na viagem, devolvendo
-- code = 'RESERVA_DUPLICADA' e o id da reserva existente. A tela pergunta se é
-- de propósito e reenvia com extra_data.permitir_duplicada = true.
-- (A trava silenciosa de 90 s continua valendo para cliques duplos.)
-- =====================================================================

create or replace function public.rpc_create_reservation(
  p_trip_date date, p_direction trip_direction, p_customer_name text, p_customer_phone text,
  p_type reservation_type default 'passagem'::reservation_type,
  p_route_point_code text default null::text,
  p_quantity integer default 1,
  p_unit_price numeric default 0,
  p_payment_method payment_method default 'dinheiro'::payment_method,
  p_pickup_neighborhood text default null::text,
  p_pickup_detail text default null::text,
  p_street text default null::text,
  p_reference_point text default null::text,
  p_dropoff_location text default null::text,
  p_pending_reason text default null::text,
  p_status reservation_status default 'confirmada'::reservation_status,
  p_extra_data jsonb default '{}'::jsonb,
  p_whatsapp_source_message_id text default null::text,
  p_created_by uuid default null::uuid,
  p_dropoff_area text default null::text,
  p_dropoff_detail text default null::text,
  p_customer_phone_secondary text default null::text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  v_fone_norm           text;
  v_fone2_norm          text;
  v_viagem_dup          uuid;
  v_ex                  record;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para criar reservas.');
  end if;
  v_actor := coalesce(auth.uid(), p_created_by);

  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
  end if;
  if coalesce(p_unit_price, 0) < 0 then
    return jsonb_build_object('success', false, 'message', 'Valor inválido.');
  end if;

  -- telefone: opcional em passagem/encomenda (reserva leve); se vier, tem que ser válido
  v_fone_digitos := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  if v_fone_digitos <> '' then
    if length(v_fone_digitos) < 10 or length(v_fone_digitos) > 13 then
      return jsonb_build_object('success', false, 'message', 'Telefone inválido (informe DDD + número).');
    end if;
    v_fone_norm := fn_normalizar_telefone(p_customer_phone);
  end if;
  if coalesce(btrim(p_customer_phone_secondary), '') <> '' then
    if length(regexp_replace(p_customer_phone_secondary, '\D', '', 'g')) not between 10 and 13 then
      return jsonb_build_object('success', false, 'message', 'Telefone secundário inválido (informe DDD + número).');
    end if;
    v_fone2_norm := fn_normalizar_telefone(p_customer_phone_secondary);
  end if;

  if p_type in ('passagem', 'encomenda') then
    if coalesce(btrim(p_customer_name), '') = '' and v_fone_norm is null then
      return jsonb_build_object('success', false, 'message', 'Informe ao menos o nome ou o telefone.');
    end if;
  elsif v_fone_norm is null then
    return jsonb_build_object('success', false, 'message', 'Telefone inválido (informe DDD + número).');
  end if;

  if p_type = 'passagem' then
    if p_trip_date is null or p_trip_date < current_date - 1 then
      return jsonb_build_object('success', false, 'message', 'Data da viagem no passado — verifique a data.');
    end if;
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

  if v_fone_norm is not null then
    select id into v_customer_id from customers where phone = v_fone_norm and deleted_at is null;
  end if;

  -- Reserva duplicada: o MESMO contato já tem passagem ativa nesta viagem (em
  -- qualquer ponto). Recusa com aviso; a equipe pode confirmar que é de
  -- propósito (extra_data.permitir_duplicada = true). Sem telefone, compara o
  -- nome. O bot (whatsapp_source_message_id) segue o fluxo próprio dele.
  if p_type = 'passagem' and p_whatsapp_source_message_id is null
     and coalesce(p_extra_data ->> 'permitir_duplicada', '') <> 'true' then
    select id into v_viagem_dup from trips
      where trip_date = p_trip_date and direction = p_direction and deleted_at is null;
    if v_viagem_dup is not null then
      select r.id as rid, r.quantity as qtd, r.status as st, rp.name as ponto, c.name as nome
        into v_ex
        from reservations r
        join customers c on c.id = r.customer_id
        left join route_points rp on rp.id = r.route_point_id
        where r.trip_id = v_viagem_dup
          and r.type = 'passagem'
          and r.deleted_at is null
          and r.status in ('confirmada', 'embarcado', 'pendente', 'espera')
          and (
            (v_customer_id is not null and r.customer_id = v_customer_id)
            or (v_fone_norm is null
                and btrim(coalesce(p_customer_name, '')) <> ''
                and lower(btrim(c.name)) = lower(btrim(p_customer_name)))
          )
        order by r.created_at desc
        limit 1;
      if found then
        return jsonb_build_object(
          'success', false, 'status', 'duplicate', 'code', 'RESERVA_DUPLICADA',
          'existing_reservation_id', v_ex.rid,
          'message', format('%s já tem reserva nesta viagem: %s passagem(ns)%s (%s).',
            coalesce(nullif(btrim(v_ex.nome), ''), 'Este contato'), v_ex.qtd,
            coalesce(' em ' || v_ex.ponto, ''), v_ex.st));
      end if;
    end if;
  end if;
  if v_customer_id is null then
    insert into customers (name, phone, phone_secondary, default_neighborhood, created_by)
      values (coalesce(nullif(btrim(p_customer_name), ''), ''), v_fone_norm, v_fone2_norm,
              p_pickup_neighborhood, v_actor)
      returning id into v_customer_id;
  else
    update customers set
        name = coalesce(nullif(p_customer_name, ''), name),
        phone = v_fone_norm,
        phone_secondary = coalesce(v_fone2_norm, phone_secondary),
        default_neighborhood = coalesce(p_pickup_neighborhood, default_neighborhood),
        updated_by = v_actor
      where id = v_customer_id;
  end if;

  if p_route_point_code is not null then
    select id into v_route_point_id from route_points
      where direction = p_direction and code = p_route_point_code and deleted_at is null;
  end if;

  -- passagem E encomenda ganham viagem (frete continua sem)
  if p_type in ('passagem', 'encomenda') then
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

    if p_type = 'passagem' and p_whatsapp_source_message_id is null then
      select id into v_dup from reservations
        where customer_id = v_customer_id
          and trip_id = v_trip_id
          and coalesce(route_point_id::text, '') = coalesce(v_route_point_id::text, '')
          and type = 'passagem'
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

  -- só passagem confirmada ocupa vaga; encomenda/frete/pendente/espera nascem 'cancelado'
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
