-- =====================================================================
-- ROTA PIRAPEMAS — 61: passagens extras fora das vagas (#210)
-- =====================================================================
-- Rodar depois de 01–60. Idempotente.
-- Passageiros que embarcam fora do esquema (ex.: na beira da estrada) não
-- ocupam uma das vagas da viagem (31). A reserva é marcada com
-- reservations.extra_data.fora_lotacao = true e:
--   * NÃO conta nos gatilhos de capacidade (criar, mover, mudar status);
--   * NÃO conta em v_trip_occupancy.occupied/available (a Agenda, o
--     diagnóstico de overbooking e o bot leem dali) — ganha a coluna `extras`;
--   * NÃO dispara o aviso "viagem lotada";
--   * continua na lista de embarque, nos pagamentos e no financeiro.
-- rpc_set_reservation_extra liga/desliga a marca em uma reserva existente;
-- ao desligar, a lotação é revalidada (se a viagem já lotou, nada muda).
-- =====================================================================

create or replace function public.fn_is_extra(p_extra jsonb) returns boolean
language sql immutable
as $$ select coalesce(p_extra ->> 'fora_lotacao', '') = 'true' $$;

-- ---------------------------------------------------------------------
-- Gatilho de capacidade por passageiro
-- ---------------------------------------------------------------------
create or replace function public.fn_check_trip_capacity() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_trip_id  uuid;
  v_extra    boolean;
  v_capacity int;
  v_occupied int;
begin
  select r.trip_id, fn_is_extra(r.extra_data) into v_trip_id, v_extra
    from reservations r where r.id = NEW.reservation_id;

  if v_trip_id is null then
    return NEW;  -- frete/encomenda ou reserva ainda sem viagem definida: não entra na checagem de lotação
  end if;
  if v_extra then
    return NEW;  -- passagem extra (fora das vagas): não ocupa lugar
  end if;

  select capacity into v_capacity from trips where id = v_trip_id for update;
  if v_capacity is null then
    raise exception 'Viagem % não encontrada para checagem de capacidade', v_trip_id;
  end if;

  if NEW.status in ('confirmado', 'embarcado') then
    select count(*) into v_occupied
      from reservation_passengers rp
      join reservations r2 on r2.id = rp.reservation_id
      where r2.trip_id = v_trip_id
        and not fn_is_extra(r2.extra_data)
        and rp.status in ('confirmado', 'embarcado')
        and rp.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_occupied + 1 > v_capacity then
      raise exception 'CAPACIDADE_EXCEDIDA: viagem % já tem % de % lugares ocupados'
        , v_trip_id, v_occupied, v_capacity
        using errcode = 'P0001', hint = 'Ofereça lista de espera ao cliente.';
    end if;
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- Gatilho ao mover a reserva para outra viagem
-- ---------------------------------------------------------------------
create or replace function public.fn_check_trip_capacity_on_reservation_move() returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_capacity  int;
  v_occupied  int;
  v_new_qty   int;
begin
  if NEW.trip_id is not distinct from OLD.trip_id then
    return NEW;
  end if;
  if NEW.trip_id is null then
    return NEW;
  end if;
  if fn_is_extra(NEW.extra_data) then
    return NEW;  -- passagem extra: não ocupa lugar na viagem de destino
  end if;

  select count(*) into v_new_qty
    from reservation_passengers
    where reservation_id = NEW.id and status in ('confirmado', 'embarcado');

  if v_new_qty = 0 then
    return NEW;
  end if;

  select capacity into v_capacity from trips where id = NEW.trip_id for update;
  if v_capacity is null then
    raise exception 'Viagem % não encontrada para checagem de capacidade', NEW.trip_id
      using errcode = 'P0001';
  end if;

  select count(*) into v_occupied
    from reservation_passengers rp
    join reservations r2 on r2.id = rp.reservation_id
    where r2.trip_id = NEW.trip_id
      and not fn_is_extra(r2.extra_data)
      and rp.status in ('confirmado', 'embarcado')
      and r2.id <> NEW.id;

  if v_occupied + v_new_qty > v_capacity then
    raise exception 'CAPACIDADE_EXCEDIDA: viagem de destino já tem % de % lugares ocupados (precisa de % vaga(s))'
      , v_occupied, v_capacity, v_new_qty
      using errcode = 'P0001', hint = 'Ofereça lista de espera ao cliente.';
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- Aviso "viagem lotada": extras não contam nem disparam
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_trip_full() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_trip_id uuid;
  v_extra boolean;
  v_cap  int;
  v_occ  int;
  v_data date;
  v_dir  trip_direction;
begin
  if NEW.status not in ('confirmado', 'embarcado') then
    return NEW;
  end if;

  select r.trip_id, fn_is_extra(r.extra_data) into v_trip_id, v_extra
    from reservations r where r.id = NEW.reservation_id;
  if v_trip_id is null or v_extra then
    return NEW;
  end if;

  select capacity, trip_date, direction into v_cap, v_data, v_dir
    from trips where id = v_trip_id;
  if v_cap is null then
    return NEW;
  end if;

  select count(*) into v_occ
    from reservation_passengers rp
    join reservations r2 on r2.id = rp.reservation_id
    where r2.trip_id = v_trip_id
      and not fn_is_extra(r2.extra_data)
      and rp.status in ('confirmado', 'embarcado')
      and r2.deleted_at is null;

  if v_occ < v_cap then
    return NEW;
  end if;

  if exists (
    select 1 from app_notifications
    where kind = 'lotacao'
      and (meta ->> 'trip_id') = v_trip_id::text
      and created_at > now() - interval '12 hours'
  ) then
    return NEW;
  end if;

  perform fn_app_notify(
    'lotacao',
    format('Viagem lotada — %s %s', coalesce(v_dir::text, ''), to_char(v_data, 'DD/MM')),
    format('A %s de %s atingiu a capacidade (%s lugares).',
           coalesce(v_dir::text, 'viagem'), to_char(v_data, 'DD/MM'), v_cap),
    null, v_data, v_dir,
    jsonb_build_object('trip_id', v_trip_id, 'capacidade', v_cap));

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- Ocupação por viagem: `occupied`/`available` só com quem ocupa vaga;
-- `extras` (coluna nova, no fim) = passageiros fora das vagas.
-- ---------------------------------------------------------------------
create or replace view public.v_trip_occupancy as
 SELECT t.id AS trip_id,
    t.trip_date,
    t.direction,
    t.capacity,
    COALESCE(sum(
        CASE
            WHEN rp.status = ANY (ARRAY['confirmado'::passenger_status, 'embarcado'::passenger_status])
                 AND NOT fn_is_extra(r.extra_data) THEN 1
            ELSE 0
        END), 0::bigint) AS occupied,
    (t.capacity - COALESCE(sum(
        CASE
            WHEN rp.status = ANY (ARRAY['confirmado'::passenger_status, 'embarcado'::passenger_status])
                 AND NOT fn_is_extra(r.extra_data) THEN 1
            ELSE 0
        END), 0::bigint)) AS available,
    COALESCE(sum(
        CASE
            WHEN rp.status = 'embarcado'::passenger_status THEN 1
            ELSE 0
        END), 0::bigint) AS boarded,
    t.status,
    t.started_at,
    t.finished_at,
    t.start_km,
    t.end_km,
    t.duration_min,
    t.driver_id,
    COALESCE(sum(
        CASE
            WHEN rp.status = ANY (ARRAY['confirmado'::passenger_status, 'embarcado'::passenger_status])
                 AND fn_is_extra(r.extra_data) THEN 1
            ELSE 0
        END), 0::bigint) AS extras
   FROM trips t
     LEFT JOIN reservations r ON r.trip_id = t.id AND r.deleted_at IS NULL
     LEFT JOIN reservation_passengers rp ON rp.reservation_id = r.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id;

-- ---------------------------------------------------------------------
-- Liga/desliga "extra (fora das vagas)" numa reserva existente.
-- Desligar volta a ocupar vaga: se a viagem já lotou, NADA muda.
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_reservation_extra(
  p_reservation_id uuid,
  p_extra          boolean,
  p_actor          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid;
  v_res   reservations%rowtype;
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
  if v_res.type <> 'passagem' then
    return jsonb_build_object('success', false, 'message', 'Só passagens podem ser extras.');
  end if;

  update reservations
     set extra_data = case when p_extra
                           then coalesce(extra_data, '{}'::jsonb) || jsonb_build_object('fora_lotacao', true)
                           else coalesce(extra_data, '{}'::jsonb) - 'fora_lotacao' end,
         updated_by = v_actor
   where id = p_reservation_id;

  if not p_extra then
    -- volta a ocupar vaga: o gatilho de capacidade revalida cada passageiro
    update reservation_passengers set status = status, updated_by = v_actor
     where reservation_id = p_reservation_id and status in ('confirmado', 'embarcado');
  end if;

  return jsonb_build_object('success', true, 'extra', p_extra);

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false,
      'message', 'A viagem já está lotada — não dá para voltar esta passagem às vagas.');
end;
$fn$;
revoke execute on function public.rpc_set_reservation_extra(uuid, boolean, uuid) from public, anon;
grant  execute on function public.rpc_set_reservation_extra(uuid, boolean, uuid) to authenticated, service_role;

-- Conferir:
--   select trip_date, direction, occupied, available, extras from v_trip_occupancy order by trip_date desc limit 10;
