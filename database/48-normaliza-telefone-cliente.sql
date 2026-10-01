-- =====================================================================
-- ROTA PIRAPEMAS — 48: NORMALIZAÇÃO DE TELEFONE NO BACKEND
-- =====================================================================
-- Bug real encontrado em auditoria: rpc_create_reservation (migração 34)
-- calcula v_fone_digitos só para validar a quantidade de dígitos, mas o
-- lookup/insert do cliente continua usando p_customer_phone CRU. O
-- mesmo número digitado uma vez ("98999998888") e colado outra vez do
-- WhatsApp ("+55 98 99999-8888") vira DOIS clientes diferentes — o app
-- "não reconhece" o número. rpc_edit_reservation tem o mesmo problema
-- no bloco de contato (só btrim, sem normalizar). A unicidade de
-- customers.phone (01-schema.sql) é sobre a string crua, então hoje é
-- possível até duas linhas "únicas" pro mesmo número real.
--
-- fn_normalizar_telefone espelha domain/validacao.js (validarTelefone):
-- remove tudo que não é dígito e tira o prefixo "55" só quando sobra
-- mais de 11 dígitos (pra não confundir com DDD 55 de verdade).
--
-- Rodar depois de 01-47. Idempotente (create or replace / updates
-- condicionais).
-- =====================================================================

create or replace function public.fn_normalizar_telefone(p_telefone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) > 11
     and regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') like '55%'
    then substring(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') from 3)
    else regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
  end;
$$;

-- A versão antiga (19 params, sem dropoff_area/detail) de 03-rpc-functions.sql
-- ficou esquecida como um segundo overload — sem guarda de papel, sem
-- validação de telefone, sem anti-duplicidade. Nenhum caminho do app
-- precisa dela (frontend e o bot de WhatsApp sempre podem cair na versão
-- de 21 params, que tem default null pros dois campos novos).
drop function if exists public.rpc_create_reservation(
  date, trip_direction, text, text, reservation_type, text, integer, numeric,
  payment_method, text, text, text, text, text, text, reservation_status,
  jsonb, text, uuid
);

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
  v_fone_norm           text;
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
  v_fone_norm := fn_normalizar_telefone(p_customer_phone);
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

  -- upsert de cliente por telefone NORMALIZADO (mesma lógica do frontend) —
  -- antes comparava/gravava p_customer_phone cru: "98999998888" e
  -- "+55 98 99999-8888" viravam dois clientes diferentes.
  select id into v_customer_id from customers where phone = v_fone_norm and deleted_at is null;
  if v_customer_id is null then
    insert into customers (name, phone, default_neighborhood, created_by)
      values (nullif(p_customer_name, ''), v_fone_norm, p_pickup_neighborhood, v_actor)
      returning id into v_customer_id;
  else
    update customers set
        name = coalesce(nullif(p_customer_name, ''), name),
        phone = v_fone_norm,
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

-- rpc_edit_reservation (33): o bloco de contato gravava o telefone só
-- com btrim, sem normalizar — mesma falha.
create or replace function public.rpc_edit_reservation(
  p_reservation_id uuid,
  p_details        jsonb   default null,
  p_quantity       integer default null,
  p_contact        jsonb   default null,
  p_move           jsonb   default null,
  p_paid           jsonb   default null,
  p_proof          jsonb   default null,
  p_actor          uuid    default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor              uuid;
  v_res                reservations%rowtype;
  v_trip_id            uuid;
  v_rp_id              uuid;
  v_default_vehicle_id uuid;
  v_dir                trip_direction;
  v_new_date           date;
  v_code               text;
  v_current            integer;
  v_max_seq            integer;
  v_pstatus            passenger_status;
  v_i                  integer;
  v_pay_id             uuid;
  v_pm                 payment_method;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  select * into v_res from reservations where id = p_reservation_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  -- 1) contato (customers)
  if p_contact is not null and (p_contact ? 'name' or p_contact ? 'phone') then
    update customers set
      name  = case when p_contact ? 'name'  then nullif(btrim(p_contact->>'name'), '')  else name  end,
      phone = case when p_contact ? 'phone' then nullif(fn_normalizar_telefone(p_contact->>'phone'), '') else phone end,
      updated_by = v_actor
    where id = coalesce((p_contact->>'customer_id')::uuid, v_res.customer_id);
  end if;

  -- 2) detalhes que NÃO afetam vaga (whitelist explícita)
  if p_details is not null then
    update reservations set
      dropoff_location    = case when p_details ? 'dropoff_location'    then nullif(btrim(p_details->>'dropoff_location'), '')    else dropoff_location end,
      payment_method      = case when p_details ? 'payment_method'      then (p_details->>'payment_method')::payment_method       else payment_method end,
      street              = case when p_details ? 'street'              then nullif(btrim(p_details->>'street'), '')              else street end,
      reference_point     = case when p_details ? 'reference_point'     then nullif(btrim(p_details->>'reference_point'), '')     else reference_point end,
      pickup_neighborhood = case when p_details ? 'pickup_neighborhood' then nullif(btrim(p_details->>'pickup_neighborhood'), '') else pickup_neighborhood end,
      pickup_detail       = case when p_details ? 'pickup_detail'       then nullif(btrim(p_details->>'pickup_detail'), '')       else pickup_detail end,
      dropoff_area        = case when p_details ? 'dropoff_area'        then nullif(btrim(p_details->>'dropoff_area'), '')        else dropoff_area end,
      dropoff_detail      = case when p_details ? 'dropoff_detail'      then nullif(btrim(p_details->>'dropoff_detail'), '')      else dropoff_detail end,
      updated_by = v_actor
    where id = p_reservation_id;
  end if;

  -- 3) quantidade (add/remove passageiros → dispara a trigger de capacidade)
  if p_quantity is not null then
    if p_quantity < 1 then
      return jsonb_build_object('success', false, 'message', 'Quantidade inválida.');
    end if;
    select count(*), coalesce(max(seq), 0) into v_current, v_max_seq
      from reservation_passengers where reservation_id = p_reservation_id and status <> 'cancelado';
    select status into v_pstatus from reservation_passengers
      where reservation_id = p_reservation_id and status <> 'cancelado' order by seq limit 1;
    v_pstatus := coalesce(v_pstatus, 'confirmado');
    if p_quantity > v_current then
      for v_i in 1..(p_quantity - v_current) loop
        insert into reservation_passengers (reservation_id, seq, status, created_by)
        values (p_reservation_id, v_max_seq + v_i, v_pstatus, v_actor);
      end loop;
    elsif p_quantity < v_current then
      update reservation_passengers set status = 'cancelado', updated_by = v_actor
        where id in (
          select id from reservation_passengers
          where reservation_id = p_reservation_id and status <> 'cancelado'
          order by seq desc limit (v_current - p_quantity));
    end if;
    update reservations set total_price = coalesce(unit_price, 0) * p_quantity, updated_by = v_actor
      where id = p_reservation_id;
  end if;

  -- 4) mover (viagem/ponto → dispara capacidade contra a viagem de destino)
  if p_move is not null and (p_move ? 'trip_date') then
    v_new_date := (p_move->>'trip_date')::date;
    v_dir := (p_move->>'direction')::trip_direction;
    v_code := p_move->>'route_point_code';
    select id into v_trip_id from trips
      where trip_date = v_new_date and direction = v_dir and deleted_at is null;
    if v_trip_id is null then
      select id into v_default_vehicle_id from vehicles where is_default and active and deleted_at is null limit 1;
      insert into trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by)
        select v_new_date, v_dir, v.id, v.capacity,
               (extract(dow from v_new_date) = 1 and v_dir = 'ida'), 'agendada', v_actor
        from vehicles v where v.id = v_default_vehicle_id
        returning id into v_trip_id;
    end if;
    if v_code is not null then
      select id into v_rp_id from route_points where direction = v_dir and code = v_code and deleted_at is null;
    end if;
    update reservations set trip_id = v_trip_id,
        route_point_id = coalesce(v_rp_id, route_point_id), updated_by = v_actor
      where id = p_reservation_id;
    update reservation_passengers set status = status, updated_by = v_actor
      where reservation_id = p_reservation_id and status in ('confirmado', 'embarcado');
  end if;

  -- 5) pagamento (um registro de payments por reserva — cria se não existe)
  if p_paid is not null and (p_paid ? 'paid') then
    v_pm := coalesce((p_paid->>'method')::payment_method, v_res.payment_method, 'dinheiro');
    select id into v_pay_id from payments
      where reservation_id = p_reservation_id and deleted_at is null order by created_at limit 1;
    if v_pay_id is null then
      insert into payments (reservation_id, amount, method, status, created_by)
        values (p_reservation_id, greatest(coalesce((p_paid->>'amount')::numeric, 0), 0), v_pm, 'pendente', v_actor)
        returning id into v_pay_id;
    end if;
    update payments set
      status  = case when (p_paid->>'paid')::boolean then 'pago'::payment_status else 'pendente'::payment_status end,
      paid_at = case when (p_paid->>'paid')::boolean then now() else null end,
      updated_by = v_actor
    where id = v_pay_id;
  end if;

  -- 6) comprovante
  if p_proof is not null and (p_proof ? 'received') then
    v_pm := coalesce((p_proof->>'method')::payment_method, v_res.payment_method, 'dinheiro');
    select id into v_pay_id from payments
      where reservation_id = p_reservation_id and deleted_at is null order by created_at limit 1;
    if v_pay_id is null then
      insert into payments (reservation_id, amount, method, status, created_by)
        values (p_reservation_id, greatest(coalesce((p_proof->>'amount')::numeric, 0), 0), v_pm, 'pendente', v_actor)
        returning id into v_pay_id;
    end if;
    update payments set proof_received = (p_proof->>'received')::boolean, updated_by = v_actor
      where id = v_pay_id;
  end if;

  return jsonb_build_object('success', true, 'message', 'edited');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
  when invalid_text_representation or datatype_mismatch then
    return jsonb_build_object('success', false, 'message', 'Dado inválido na edição da reserva.');
end;
$$;

revoke execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,uuid)
  from public, anon;
grant  execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,uuid)
  to authenticated, service_role;

-- Backfill: normaliza o que já existe. Pula (e avisa) qualquer linha
-- cuja normalização colidiria com outro cliente já cadastrado, em vez
-- de quebrar o índice único uq_customers_phone.
do $$
declare r record;
begin
  for r in
    select id, phone, fn_normalizar_telefone(phone) as norm
    from customers
    where deleted_at is null and phone is not null and phone <> fn_normalizar_telefone(phone)
  loop
    if exists (
      select 1 from customers
      where deleted_at is null and phone = r.norm and id <> r.id
    ) then
      raise notice 'customers.id=% tem telefone normalizado (%) que colide com outro cliente — revisar manualmente.', r.id, r.norm;
    else
      update customers set phone = r.norm where id = r.id;
    end if;
  end loop;
end $$;

-- Conferir:
--   select fn_normalizar_telefone('+55 98 99999-8888');  -- '98999998888'
--   select fn_normalizar_telefone('98999998888');         -- '98999998888'
