-- =====================================================================
-- ROTA PIRAPEMAS — 62: encomendas agendam de novo + reserva "leve" (#214)
-- =====================================================================
-- Rodar depois de 01–61. Idempotente.
--   1) BUG: as migrações 48 e 54 reescreveram rpc_create_reservation a partir
--      de uma versão anterior à 42 e voltaram a vincular a viagem (trip_id) só
--      quando p_type = 'passagem'. Resultado: encomenda criada na Agenda ficava
--      sem viagem/data e sumia (nem Agenda, nem Lista do Dia). Volta a vincular
--      também para 'encomenda'.
--   2) As 3 encomendas que já ficaram presas sem viagem voltam como PENDENTES
--      (aparecem em "Encomendas pendentes" da Agenda para escolher data/ponto).
--   3) Reserva "leve": passagem/encomenda pode nascer só com NOME ou só com
--      TELEFONE — o resto se completa depois, editando a reserva.
--      customers.phone passa a aceitar vazio (NULL). Editar a reserva e
--      informar um telefone que já pertence a outro cadastro passa a reserva
--      para esse cliente (em vez de dar erro de duplicidade).
-- =====================================================================

alter table public.customers alter column phone drop not null;

-- ---------------------------------------------------------------------
-- 1) + 3) rpc_create_reservation
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3) rpc_edit_reservation: telefone que já é de outro cadastro move a reserva
--    para esse cliente; nome pode ficar vazio.
-- ---------------------------------------------------------------------
create or replace function public.rpc_edit_reservation(
  p_reservation_id uuid,
  p_details jsonb default null::jsonb,
  p_quantity integer default null::integer,
  p_contact jsonb default null::jsonb,
  p_move jsonb default null::jsonb,
  p_paid jsonb default null::jsonb,
  p_proof jsonb default null::jsonb,
  p_extra_data jsonb default null::jsonb,
  p_status reservation_status default null::reservation_status,
  p_actor uuid default null::uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_cust               uuid;
  v_fone               text;
  v_other              uuid;
  v_juntou             boolean := false;
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

  if p_contact is not null and (p_contact ? 'name' or p_contact ? 'phone' or p_contact ? 'phone_secondary') then
    v_cust := coalesce((p_contact->>'customer_id')::uuid, v_res.customer_id);

    -- o número informado já é de OUTRO cadastro: a reserva passa a ser dele
    if p_contact ? 'phone' then
      v_fone := nullif(fn_normalizar_telefone(p_contact->>'phone'), '');
      if v_fone is not null then
        select id into v_other from customers
          where phone = v_fone and deleted_at is null and id <> v_cust limit 1;
        if v_other is not null then
          update reservations set customer_id = v_other, updated_by = v_actor
            where id = p_reservation_id;
          update customers set
              name = case when btrim(name) = '' and p_contact ? 'name'
                          then coalesce(nullif(btrim(p_contact->>'name'), ''), name) else name end,
              phone_secondary = case when p_contact ? 'phone_secondary' and phone_secondary is null
                                     then nullif(fn_normalizar_telefone(p_contact->>'phone_secondary'), '')
                                     else phone_secondary end,
              updated_by = v_actor
            where id = v_other;
          -- cadastro antigo sem telefone e sem outras reservas: sai de cena
          update customers set deleted_at = now(), updated_by = v_actor
            where id = v_cust and phone is null
              and not exists (select 1 from reservations x
                               where x.customer_id = v_cust and x.deleted_at is null);
          v_juntou := true;
        end if;
      end if;
    end if;

    if not v_juntou then
      update customers set
        name  = case when p_contact ? 'name'  then coalesce(nullif(btrim(p_contact->>'name'), ''), '') else name  end,
        phone = case when p_contact ? 'phone' then nullif(fn_normalizar_telefone(p_contact->>'phone'), '') else phone end,
        phone_secondary = case when p_contact ? 'phone_secondary'
                               then nullif(fn_normalizar_telefone(p_contact->>'phone_secondary'), '')
                               else phone_secondary end,
        updated_by = v_actor
      where id = v_cust;
    end if;
  end if;

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
      unit_price          = case when p_details ? 'unit_price'          then (p_details->>'unit_price')::numeric                  else unit_price end,
      total_price         = case when p_details ? 'unit_price'          then (p_details->>'unit_price')::numeric * quantity       else total_price end,
      updated_by = v_actor
    where id = p_reservation_id;
  end if;

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

  if p_extra_data is not null then
    update reservations set extra_data = coalesce(extra_data, '{}'::jsonb) || p_extra_data, updated_by = v_actor
      where id = p_reservation_id;
  end if;

  if p_status is not null and v_res.type in ('frete', 'encomenda') then
    update reservations set status = p_status, pending_reason = null, updated_by = v_actor
      where id = p_reservation_id;
  end if;

  return jsonb_build_object('success', true, 'message', 'edited');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'message', SQLERRM);
  when invalid_text_representation or datatype_mismatch then
    return jsonb_build_object('success', false, 'message', 'Dado inválido na edição da reserva.');
end;
$function$;

-- ---------------------------------------------------------------------
-- 2) Encomendas que ficaram presas sem viagem (bug acima) voltam como
--    PENDENTES, para escolher data/ponto em "Encomendas pendentes".
-- ---------------------------------------------------------------------
update public.reservations
   set status = 'pendente',
       pending_reason = 'Encomenda sem data/viagem — escolha a data e o ponto para agendar.'
 where type = 'encomenda' and trip_id is null and status = 'confirmada' and deleted_at is null;

-- Conferir:
--   select id, status, trip_id, pending_reason from reservations where type = 'encomenda' order by created_at desc limit 10;
