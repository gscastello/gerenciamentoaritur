-- retrofit-soft-delete-rls.sql
--
-- ⚠️ USE database/retrofit-soft-delete-rpc.sql EM VEZ DESTE, a menos que
-- o seu SQL Editor tenha ownership das tabelas. Este script dá
-- "must be owner of relation ..." quando rodado por um papel que não é
-- dono das tabelas. O retrofit-soft-delete-rpc.sql resolve o mesmo
-- problema criando funções (só precisa de CREATE no schema).
--
-- PROBLEMA
-- Neste Postgres (Supabase / PG17) a expressão USING de uma policy de
-- SELECT é aplicada TAMBÉM como WITH CHECK na linha resultante de um
-- UPDATE — mesmo sem RETURNING. Como as policies de SELECT filtravam
-- `deleted_at IS NULL`, qualquer soft-delete (UPDATE ... SET deleted_at
-- = now()) era recusado com:
--     ERROR: new row violates row-level security policy
--
-- Isso quebrava:
--   - remover lançamento em Financeiro (financeService.softDelete)
--   - remover motorista / registro de combustível / manutenção (Operação)
-- (as reservas escapavam porque o cancelamento passa por
--  rpc_cancel_reservation, que é SECURITY DEFINER.)
--
-- SOLUÇÃO
-- Tirar `deleted_at IS NULL` das policies de SELECT. Não muda o que o app
-- enxerga: TODOS os services já filtram `.is("deleted_at", null)` na
-- própria query, e as views (v_reservations_flat, v_trip_occupancy) têm
-- `WHERE ... deleted_at IS NULL` embutido. O papel (fn_has_role) continua
-- sendo exigido.
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.

begin;

-- customers -----------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select
  using (fn_has_role(array['admin','atendente','financeiro','motorista']::user_role[]));

-- drivers ------------------------------------------------------------
drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers for select
  using (true);

-- financial_entries ------------------------------------------------
drop policy if exists financial_entries_select on public.financial_entries;
create policy financial_entries_select on public.financial_entries for select
  using (fn_has_role(array['admin','financeiro']::user_role[]));

-- fuel_records ----------------------------------------------------
drop policy if exists fuel_records_select on public.fuel_records;
create policy fuel_records_select on public.fuel_records for select
  using (fn_has_role(array['admin','financeiro']::user_role[]));

-- maintenance ---------------------------------------------------
drop policy if exists maintenance_select on public.maintenance;
create policy maintenance_select on public.maintenance for select
  using (fn_has_role(array['admin','financeiro']::user_role[]));

-- payments ---------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]));

-- reservations --------------------------------------------------
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select
  using (
    fn_has_role(array['admin','atendente','financeiro']::user_role[])
    or (
      fn_current_role() = 'motorista'::user_role
      and trip_id in (select trips.id from trips where trips.driver_id = fn_current_driver_id())
    )
  );

-- route_points -------------------------------------------------
drop policy if exists route_points_select on public.route_points;
create policy route_points_select on public.route_points for select
  using (true);

-- trips -------------------------------------------------------
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select
  using (
    fn_has_role(array['admin','atendente','financeiro']::user_role[])
    or (
      fn_current_role() = 'motorista'::user_role
      and driver_id = fn_current_driver_id()
    )
  );

-- vehicles ---------------------------------------------------
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select
  using (true);

commit;
