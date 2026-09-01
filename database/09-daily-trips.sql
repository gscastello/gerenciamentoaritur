-- =====================================================================
-- ROTA PIRAPEMAS — 09: viagens do dia sempre existem (Agenda nunca vazia)
-- =====================================================================
-- Rodar depois de 01–05. Requer a extensão pg_cron habilitada (já vem
-- ligada nos projetos Supabase; se não, Database → Extensions → pg_cron).
--
-- Antes desta migração, uma linha em `trips` só nascia quando entrava a
-- primeira reserva do dia (get-or-create dentro de rpc_create_reservation).
-- Consequência: em dia sem reserva, a Agenda ficava vazia e o motorista
-- não conseguia "Iniciar viagem".
--
--   1) index único parcial (trip_date, direction) — idempotência e
--      correção da corrida latente do get-or-create;
--   2) fn_ensure_upcoming_trips(dias) — cria a Ida/Volta que faltar numa
--      janela [hoje, hoje+dias], com a capacidade do veículo padrão
--      (snapshot) e o monday_adjusted correto;
--   3) rpc_ensure_trips(dias) — a mesma coisa, chamável pelo frontend
--      como rede de segurança se o cron atrasar;
--   4) roda 1x na aplicação (hoje..+21);
--   5) pg_cron diário 00:10 UTC (~21:10 São Luís) mantendo 14 dias à frente.

-- 1 -------------------------------------------------------------------
create unique index if not exists trips_date_direction_uniq
  on public.trips (trip_date, direction)
  where deleted_at is null;

-- 2 -------------------------------------------------------------------
create or replace function public.fn_ensure_upcoming_trips(p_days integer default 14)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_created integer := 0;
  v_days    integer := least(greatest(coalesce(p_days, 14), 0), 90);  -- teto de segurança
begin
  select * into v_vehicle
    from public.vehicles
   where is_default and active and deleted_at is null
   limit 1;

  if not found then
    raise notice 'fn_ensure_upcoming_trips: nenhum veiculo padrao configurado — nada a fazer';
    return 0;
  end if;

  with alvo as (
    select (current_date + g.n)::date               as trip_date,
           dir.direction                            as direction
      from generate_series(0, v_days) as g(n)
      cross join (values ('ida'::public.trip_direction),
                         ('volta'::public.trip_direction)) as dir(direction)
  ),
  novas as (
    insert into public.trips
           (trip_date, direction, vehicle_id, capacity, monday_adjusted, status)
    select a.trip_date,
           a.direction,
           v_vehicle.id,
           v_vehicle.capacity,
           (extract(dow from a.trip_date) = 1 and a.direction = 'ida'),
           'agendada'
      from alvo a
    on conflict (trip_date, direction) where deleted_at is null
    do nothing
    returning 1
  )
  select count(*) into v_created from novas;

  return v_created;
end;
$$;

-- worker interno: só o cron (service_role). O usuário do app usa
-- rpc_ensure_trips, que é SECURITY DEFINER e chama esta por baixo.
revoke execute on function public.fn_ensure_upcoming_trips(integer) from public, anon, authenticated;
grant  execute on function public.fn_ensure_upcoming_trips(integer) to service_role;

-- 3 -------------------------------------------------------------------
create or replace function public.rpc_ensure_trips(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_created integer;
begin
  v_created := public.fn_ensure_upcoming_trips(least(greatest(coalesce(p_days, 14), 0), 60));
  return jsonb_build_object('success', true, 'created', v_created);
end;
$$;

revoke execute on function public.rpc_ensure_trips(integer) from public, anon;
grant  execute on function public.rpc_ensure_trips(integer) to authenticated, service_role;

-- 4 -------------------------------------------------------------------
select public.fn_ensure_upcoming_trips(21);

-- 5 -------------------------------------------------------------------
select cron.schedule(
  'ensure-upcoming-trips',
  '10 0 * * *',
  $cron$ select public.fn_ensure_upcoming_trips(14); $cron$
);

-- Conferir:  select * from cron.job where jobname = 'ensure-upcoming-trips';
--            select trip_date, direction, status from trips
--              where deleted_at is null order by trip_date;
