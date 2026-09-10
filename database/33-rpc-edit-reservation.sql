-- =====================================================================
-- ROTA PIRAPEMAS — 33: EDIÇÃO DE RESERVA EM UMA TRANSAÇÃO
-- =====================================================================
-- O modal "Editar reserva" fazia até 6 chamadas RPC separadas (mover +
-- detalhes + quantidade + contato + pagamento + comprovante). Se uma
-- falhava no meio, a reserva ficava pela metade.
--
-- rpc_edit_reservation aplica tudo numa função só = UMA transação: se a
-- checagem de capacidade (mover / mudar quantidade) recusar, TUDO volta
-- atrás. Todos os blocos são opcionais (só entram os campos enviados).
--
-- Rodar depois de 01-32. Idempotente.
-- =====================================================================

create or replace function public.rpc_edit_reservation(
  p_reservation_id uuid,
  p_details        jsonb   default null,   -- {dropoff_location, payment_method, street, reference_point, pickup_neighborhood, pickup_detail, dropoff_area, dropoff_detail}
  p_quantity       integer default null,
  p_contact        jsonb   default null,   -- {customer_id, name, phone}
  p_move           jsonb   default null,   -- {trip_date, direction, route_point_code}
  p_paid           jsonb   default null,   -- {paid: bool, amount, method}
  p_proof          jsonb   default null,   -- {received: bool, amount, method}
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

-- Conferir:
--   select public.rpc_edit_reservation('<uuid>', p_details => '{"dropoff_location":"X"}'::jsonb);
