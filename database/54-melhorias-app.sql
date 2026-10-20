-- =====================================================================
-- ROTA PIRAPEMAS — 54: melhorias do app (issue #192)
-- =====================================================================
-- Rodar depois de 01–53. Idempotente.
--   1) telefone secundário do passageiro (customers.phone_secondary)
--   2) cidades de desembarque com "exige revisão" (dropoff_areas.needs_review)
--   3) limpar notificações (por usuário) e resolver todas as pendências
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Telefone secundário
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists phone_secondary text;

-- A Agenda lê tudo de v_reservations_flat (select *): coluna nova só no fim.
create or replace view public.v_reservations_flat with (security_invoker = true) as
 SELECT r.id,
    t.trip_date AS data,
    r.trip_id,
    COALESCE(t.direction, NULL::trip_direction) AS direcao,
    rp.code AS "pontoId",
    r.pickup_neighborhood AS bairro,
    r.pickup_detail AS "localExato",
    r.street AS rua,
    r.reference_point AS referencia,
    r.dropoff_location AS desembarque,
    r.quantity AS quantidade,
    r.unit_price AS "valorUnit",
    r.total_price AS "valorTotal",
    r.payment_method AS pagamento,
    r.status,
    r.type AS tipo,
    r.pending_reason AS "motivoPendente",
    r.extra_data AS extra,
    c.id AS customer_id,
    c.name AS nome,
    c.phone AS telefone,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE p.reservation_id = r.id AND p.status = 'pago'::payment_status AND p.deleted_at IS NULL)) AS pago,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE p.reservation_id = r.id AND p.proof_received AND p.deleted_at IS NULL)) AS "comprovanteRecebido",
    ( SELECT bool_or(rp2.status = 'embarcado'::passenger_status) AS bool_or
           FROM reservation_passengers rp2
          WHERE rp2.reservation_id = r.id) AS "temEmbarcado",
    r.created_at AS "criadoEm",
    r.updated_at AS "atualizadoEm",
    r.dropoff_area AS "desembarqueArea",
    r.dropoff_detail AS "desembarqueDetalhe",
    r.dropoff_seq AS "desembarqueSeq",
    r.pickup_transport AS "buscaPor",
    c.phone_secondary AS telefone2
   FROM reservations r
     LEFT JOIN trips t ON t.id = r.trip_id
     LEFT JOIN route_points rp ON rp.id = r.route_point_id
     JOIN customers c ON c.id = r.customer_id
  WHERE r.deleted_at IS NULL;

-- Passageiros (CRM): mesma coluna no fim de v_customers_stats.
create or replace view public.v_customers_stats with (security_invoker = true) as
 SELECT c.id AS customer_id,
    c.name AS nome,
    c.phone AS telefone,
    c.notes,
    c.default_neighborhood AS bairro_padrao,
    count(r.id) FILTER (WHERE r.status = ANY (ARRAY['confirmada'::reservation_status, 'embarcado'::reservation_status])) AS viagens_count,
    COALESCE(sum(r.quantity) FILTER (WHERE r.status = ANY (ARRAY['confirmada'::reservation_status, 'embarcado'::reservation_status])), 0::bigint)::integer AS total_passagens,
    count(r.id) FILTER (WHERE r.status = 'cancelada'::reservation_status) AS cancelamentos,
    count(r.id) FILTER (WHERE r.status = 'nao_compareceu'::reservation_status) AS nao_compareceu,
    COALESCE(sum(r.total_price) FILTER (WHERE r.status = ANY (ARRAY['confirmada'::reservation_status, 'embarcado'::reservation_status])), 0::numeric) AS total_gasto,
    max(t.trip_date) AS ultima_data,
    count(r.id) AS reservas_total,
    c.default_route_point_code AS ponto_padrao,
    c.default_payment_method AS pagamento_padrao,
    c.phone_secondary AS telefone2
   FROM customers c
     LEFT JOIN reservations r ON r.customer_id = c.id AND r.deleted_at IS NULL AND r.type = 'passagem'::reservation_type
     LEFT JOIN trips t ON t.id = r.trip_id
  WHERE c.deleted_at IS NULL
  GROUP BY c.id, c.name, c.phone, c.phone_secondary, c.notes, c.default_neighborhood, c.default_route_point_code, c.default_payment_method;

-- Criar reserva: aceita o secundário (22º parâmetro, opcional).
drop function if exists public.rpc_create_reservation(
  date, trip_direction, text, text, reservation_type, text, integer, numeric, payment_method,
  text, text, text, text, text, text, reservation_status, jsonb, text, uuid, text, text);

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
  v_fone_digitos := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  if length(v_fone_digitos) < 10 or length(v_fone_digitos) > 13 then
    return jsonb_build_object('success', false, 'message', 'Telefone inválido (informe DDD + número).');
  end if;
  v_fone_norm := fn_normalizar_telefone(p_customer_phone);
  -- secundário: opcional, mas se vier tem que ser um telefone válido
  if coalesce(btrim(p_customer_phone_secondary), '') <> '' then
    if length(regexp_replace(p_customer_phone_secondary, '\D', '', 'g')) not between 10 and 13 then
      return jsonb_build_object('success', false, 'message', 'Telefone secundário inválido (informe DDD + número).');
    end if;
    v_fone2_norm := fn_normalizar_telefone(p_customer_phone_secondary);
  end if;
  if p_type = 'passagem' then
    if coalesce(btrim(p_customer_name), '') = '' then
      return jsonb_build_object('success', false, 'message', 'Nome do passageiro é obrigatório.');
    end if;
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

  select id into v_customer_id from customers where phone = v_fone_norm and deleted_at is null;
  if v_customer_id is null then
    insert into customers (name, phone, phone_secondary, default_neighborhood, created_by)
      values (nullif(p_customer_name, ''), v_fone_norm, v_fone2_norm, p_pickup_neighborhood, v_actor)
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

revoke execute on function public.rpc_create_reservation(date,trip_direction,text,text,reservation_type,text,integer,numeric,payment_method,text,text,text,text,text,text,reservation_status,jsonb,text,uuid,text,text,text)
  from public, anon;
grant execute on function public.rpc_create_reservation(date,trip_direction,text,text,reservation_type,text,integer,numeric,payment_method,text,text,text,text,text,text,reservation_status,jsonb,text,uuid,text,text,text)
  to authenticated, service_role;

-- Editar reserva: o bloco de contato passa a aceitar `phone_secondary`
-- (e normaliza o telefone, como o 48 já faz na versão antiga).
create or replace function public.rpc_edit_reservation(
  p_reservation_id uuid, p_details jsonb default null::jsonb, p_quantity integer default null::integer,
  p_contact jsonb default null::jsonb, p_move jsonb default null::jsonb, p_paid jsonb default null::jsonb,
  p_proof jsonb default null::jsonb, p_extra_data jsonb default null::jsonb,
  p_status reservation_status default null::reservation_status, p_actor uuid default null::uuid
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
    update customers set
      name  = case when p_contact ? 'name'  then nullif(btrim(p_contact->>'name'), '')  else name  end,
      phone = case when p_contact ? 'phone' then nullif(fn_normalizar_telefone(p_contact->>'phone'), '') else phone end,
      phone_secondary = case when p_contact ? 'phone_secondary'
                             then nullif(fn_normalizar_telefone(p_contact->>'phone_secondary'), '')
                             else phone_secondary end,
      updated_by = v_actor
    where id = coalesce((p_contact->>'customer_id')::uuid, v_res.customer_id);
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

revoke execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,reservation_status,uuid)
  from public, anon;
grant  execute on function public.rpc_edit_reservation(uuid,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,reservation_status,uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Cidades de desembarque que EXIGEM revisão do dono
--    (reserva para cidade fora de São Luís/Cantanhede/Pirapemas nasce
--    pendente — a Agenda aplica isso; o bot já faz pelo texto).
-- ---------------------------------------------------------------------
alter table public.dropoff_areas add column if not exists needs_review boolean not null default false;

insert into public.dropoff_areas (direction, code, label, detail_label, detail_placeholder, detail_required, sort_order, needs_review)
select d.direction, c.code, c.label, 'Onde em ' || c.label, 'Rua / ponto de referência', false, c.ordem, true
from (values ('ida'), ('volta')) as d(direction)
cross join (values
  ('campestre',  'Campestre',        50),
  ('matoes',     'Matões do Norte',  60),
  ('miranda',    'Miranda do Norte', 70),
  ('bacabeira',  'Bacabeira',        80),
  ('santa_rita', 'Santa Rita',       90)
) as c(code, label, ordem)
on conflict (direction, code) where deleted_at is null do nothing;

-- O bot lê esta lista para mandar o trajeto para revisão; Campestre entra nela.
update public.settings
   set value = value || '["campestre"]'::jsonb
 where key = 'intermediate_cities'
   and not (value ? 'campestre');

-- Upsert do local de desembarque ganha o p_needs_review (último, opcional).
drop function if exists public.rpc_upsert_dropoff_area(text, text, text, text, text, boolean, integer);

create or replace function public.rpc_upsert_dropoff_area(
  p_direction text, p_code text, p_label text,
  p_detail_label text default null, p_detail_placeholder text default null,
  p_detail_required boolean default null, p_sort_order integer default null,
  p_needs_review boolean default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid; v_code text;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_direction not in ('ida', 'volta') then
    return jsonb_build_object('success', false, 'message', 'Direção inválida.');
  end if;
  if coalesce(btrim(p_label), '') = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o nome do local.');
  end if;
  v_code := lower(regexp_replace(
    translate(coalesce(nullif(btrim(p_code), ''), p_label),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-zA-Z0-9]+', '_', 'g'));
  v_code := btrim(v_code, '_');
  if v_code = '' then v_code := 'area_' || substr(gen_random_uuid()::text, 1, 8); end if;

  insert into dropoff_areas (direction, code, label, detail_label, detail_placeholder, detail_required, sort_order, needs_review, created_by, updated_by)
  values (p_direction, v_code, btrim(p_label),
          coalesce(nullif(btrim(p_detail_label), ''), 'Ponto de referência'),
          coalesce(p_detail_placeholder, ''), coalesce(p_detail_required, false),
          coalesce(p_sort_order, 100), coalesce(p_needs_review, false), auth.uid(), auth.uid())
  on conflict (direction, code) where deleted_at is null do update
    set label = excluded.label, detail_label = excluded.detail_label,
        detail_placeholder = excluded.detail_placeholder,
        detail_required = coalesce(excluded.detail_required, dropoff_areas.detail_required),
        sort_order = coalesce(excluded.sort_order, dropoff_areas.sort_order),
        needs_review = coalesce(p_needs_review, dropoff_areas.needs_review),
        active = true, updated_by = auth.uid()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id, 'code', v_code);
end;
$function$;

revoke execute on function public.rpc_upsert_dropoff_area(text,text,text,text,text,boolean,integer,boolean) from public, anon;
grant  execute on function public.rpc_upsert_dropoff_area(text,text,text,text,text,boolean,integer,boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3a) Limpar notificações — por usuário, sem apagar o histórico:
--     a marcação fica em app_notification_reads (cleared_at).
-- ---------------------------------------------------------------------
alter table public.app_notification_reads add column if not exists cleared_at timestamptz;

create or replace view public.v_app_notifications
with (security_invoker = true) as
select n.id, n.kind, n.title, n.body, n.reservation_id, n.trip_date,
       n.direction, n.meta, n.created_at,
       exists (
         select 1 from public.app_notification_reads r
         where r.notification_id = n.id and r.user_id = (select auth.uid())
       ) as lida,
       exists (
         select 1 from public.app_notification_reads r
         where r.notification_id = n.id and r.user_id = (select auth.uid())
           and r.cleared_at is not null
       ) as limpada
from public.app_notifications n
order by n.created_at desc;

grant select on public.v_app_notifications to authenticated, service_role;

create or replace function public.rpc_clear_notifications() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'message', 'Sem usuário logado.');
  end if;
  insert into public.app_notification_reads (notification_id, user_id, read_at, cleared_at)
  select n.id, v_user, now(), now()
    from public.app_notifications n
  on conflict (notification_id, user_id)
    do update set cleared_at = coalesce(public.app_notification_reads.cleared_at, now());
  get diagnostics v_n = row_count;
  return jsonb_build_object('success', true, 'cleared', v_n);
end;
$$;
revoke execute on function public.rpc_clear_notifications() from public, anon;
grant  execute on function public.rpc_clear_notifications() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3b) Resolver todas as pendências abertas (continuam no histórico)
-- ---------------------------------------------------------------------
create or replace function public.rpc_resolve_all_support_tickets() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_n     integer;
begin
  if v_actor is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update support_tickets
     set status = 'resolvida', resolved_at = now(), resolved_by = v_actor
   where status = 'aberta';
  get diagnostics v_n = row_count;
  return jsonb_build_object('success', true, 'resolved', v_n);
end;
$$;
revoke execute on function public.rpc_resolve_all_support_tickets() from public, anon;
grant  execute on function public.rpc_resolve_all_support_tickets() to authenticated, service_role;

-- Conferir:
--   select code, direction, needs_review from dropoff_areas order by direction, sort_order;
--   select * from v_reservations_flat limit 1;   -- coluna telefone2 no fim
