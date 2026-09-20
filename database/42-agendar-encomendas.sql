-- =====================================================================
-- ROTA PIRAPEMAS — 42: AGENDAR ENCOMENDAS NA AGENDA E LISTA DO DIA
-- =====================================================================
-- O tipo 'encomenda' já existia (reservation_type, PR do fluxo "Enviar
-- uma encomenda" no Reservar) mas era um beco sem saída: rpc_create_
-- reservation só vincula trip_id quando p_type='passagem', então uma
-- encomenda NUNCA ganhava uma viagem de verdade — ficava presa pra
-- sempre no balde genérico de "Pendentes" da Agenda, sem aparecer nem
-- na Agenda por ponto nem na Lista do Dia. Esta migração fecha esse
-- buraco:
--
--   1) rpc_create_reservation passa a vincular trip_id também pra
--      'encomenda' (não só 'passagem') — cria já agendada quando a
--      equipe já sabe a data/ponto.
--   2) rpc_edit_reservation ganha 3 poderes novos, TODOS já usados pelo
--      mesmo "mover" genérico que passagem usa (rpc_move_reservation,
--      database/03, sem tocar reservation_passengers.status além do que
--      já tocava — encomenda continua em TIPOS_SEM_VAGA, nunca ocupa
--      vaga, porque reservation_passengers dela é sempre 'cancelado'):
--        a) unit_price/total_price dentro de p_details (frete tem valor
--           livre, diferente de passagem que vem do preço por bairro);
--        b) p_extra_data (jsonb, faz merge) — remetente e item não têm
--           coluna própria, vivem em extra_data como o resto do fluxo
--           de encomenda já fazia;
--        c) p_status — só aplica quando a reserva é 'frete'/'encomenda'
--           (nunca passagem: essa continua confirmando só por
--           rpc_confirm_reservation, que valida capacidade de verdade).
--   3) fn_reservation_confirmed_to_revenue passa a valer também pra
--      'encomenda' — o frete cobrado vira receita automática no
--      Financeiro assim que a encomenda é confirmada, igual passagem
--      (categoria continua 'passagem' no lançamento — não quebra o
--      índice único de dedup por reserva; só o rótulo genérico de
--      "receita de reserva confirmada" já deixa claro no financeiro).
--
-- Rodar depois de 01-41. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) rpc_create_reservation: encomenda também ganha trip_id ao criar
--    (quando a equipe já sabe viagem/ponto — não precisa de um segundo
--    passo de "agendar" separado).
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

  -- get-or-create da viagem do dia — passagem E encomenda ganham trip_id
  -- (frete continua sem: não tem ponto/data fixos, é sob consulta).
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

  -- reserva confirmada de passagem já nasce ocupando vaga; pendente/espera/
  -- frete/encomenda nascem sem ocupar (status 'cancelado' até confirmação
  -- manual — encomenda nunca ocupa vaga, mesmo confirmada, por design).
  v_passenger_status := case when p_status = 'confirmada' and p_type = 'passagem' then 'confirmado' else 'cancelado' end;

  for v_i in 1..p_quantity loop
    insert into reservation_passengers (reservation_id, seq, status, created_by)
    values (v_reservation_id, v_i, v_passenger_status, p_created_by);
  end loop;

  return jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'status', p_status, 'message', 'created');

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false, 'reservation_id', null, 'status', 'rejected', 'message', SQLERRM);
end;
$$;

-- ---------------------------------------------------------------------
-- 2) rpc_edit_reservation: unit_price em p_details, novo p_extra_data
--    (merge) e novo p_status (só frete/encomenda). Assinatura muda (novo
--    parâmetro) — dropa a versão antiga pra não sobrar um overload solto.
-- ---------------------------------------------------------------------
drop function if exists public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,uuid);

create or replace function public.rpc_edit_reservation(
  p_reservation_id uuid,
  p_details        jsonb   default null,   -- {dropoff_location, payment_method, street, reference_point, pickup_neighborhood, pickup_detail, dropoff_area, dropoff_detail, unit_price}
  p_quantity       integer default null,
  p_contact        jsonb   default null,   -- {customer_id, name, phone}
  p_move           jsonb   default null,   -- {trip_date, direction, route_point_code}
  p_paid           jsonb   default null,   -- {paid: bool, amount, method}
  p_proof          jsonb   default null,   -- {received: bool, amount, method}
  p_extra_data     jsonb   default null,   -- merge em reservations.extra_data (frete/encomenda: remetente, item...)
  p_status         reservation_status default null,  -- só aplica em frete/encomenda
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
      phone = case when p_contact ? 'phone' then nullif(btrim(p_contact->>'phone'), '') else phone end,
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
      unit_price          = case when p_details ? 'unit_price'          then (p_details->>'unit_price')::numeric                  else unit_price end,
      total_price         = case when p_details ? 'unit_price'          then (p_details->>'unit_price')::numeric * quantity       else total_price end,
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

  -- 4) mover (viagem/ponto → dispara capacidade contra a viagem de destino;
  --    pra frete/encomenda é um no-op de capacidade, pois os passageiros
  --    dela nunca estão em 'confirmado'/'embarcado')
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

  -- 7) extra_data (merge, nunca substitui) — remetente/item de frete e
  --    encomenda, que não têm coluna própria.
  if p_extra_data is not null then
    update reservations set extra_data = coalesce(extra_data, '{}'::jsonb) || p_extra_data, updated_by = v_actor
      where id = p_reservation_id;
  end if;

  -- 8) status direto — só frete/encomenda. Passagem confirma sempre por
  --    rpc_confirm_reservation (que valida capacidade de verdade); abrir
  --    essa porta aqui pra passagem seria furar a checagem de lotação.
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
$$;

revoke execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,reservation_status,uuid)
  from public, anon;
grant  execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,reservation_status,uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Receita automática também pra encomenda confirmada com valor —
--    "entra no financeiro junto com o resto da receita", igual passagem.
-- ---------------------------------------------------------------------
create or replace function public.fn_reservation_confirmed_to_revenue() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if NEW.type in ('passagem', 'encomenda')
     and NEW.status in ('confirmada', 'embarcado')
     and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status) then
    perform fn_ensure_reservation_revenue(
      NEW.id, NEW.total_price, current_date, coalesce(NEW.updated_by, NEW.created_by)
    );
  end if;
  return NEW;
end;
$$;

-- Conferir:
--   select id, type, status, trip_id, route_point_id, dropoff_location, total_price, extra_data
--   from reservations where type = 'encomenda' order by created_at desc limit 10;
