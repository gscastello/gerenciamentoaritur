-- =====================================================================
-- ROTA PIRAPEMAS — 06 · SECURITY HARDENING (rodar UMA vez num banco que já
-- teve os arquivos 01–05 aplicados). Idempotente: pode rodar de novo.
--
-- Responde aos advisors do Supabase:
--   ERROR 0010_security_definer_view        -> views com security_invoker
--   WARN  0011_function_search_path_mutable -> search_path fixo nas funções
--   WARN  0014_extension_in_public          -> extensões para schema extensions
--   WARN  0028/0029 anon/authenticated pode executar SECURITY DEFINER
--         -> revoke execute dos RPCs e funções internas para 'anon'
--   WARN  0003_auth_rls_initplan            -> policies de users com (select …)
--   WARN  multiple_permissive_policies (users) -> uma policy por ação
--   INFO  0001_unindexed_foreign_keys       -> índices de cobertura (04)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. VIEWS — deixam de rodar como SECURITY DEFINER
-- ---------------------------------------------------------------------
alter view public.v_trip_occupancy    set (security_invoker = on);
alter view public.v_reservations_flat set (security_invoker = on);

revoke all    on public.v_reservations_flat from anon;
revoke all    on public.v_trip_occupancy    from anon;
grant  select on public.v_reservations_flat to authenticated;
grant  select on public.v_trip_occupancy    to authenticated;

-- ---------------------------------------------------------------------
-- 2. search_path fixo em todas as funções trigger/helper
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'fn_set_updated_at','fn_handle_new_auth_user','fn_fuel_to_financial_entry',
      'fn_maintenance_to_financial_entry','fn_audit_trigger','fn_check_trip_capacity',
      'fn_sync_reservation_quantity','fn_current_role','fn_current_driver_id','fn_has_role')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. RPCs executáveis só por 'authenticated' e 'service_role'
--    ('anon' com a chave pública do site NÃO chama mais)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'rpc_create_reservation','rpc_confirm_reservation','rpc_cancel_reservation',
      'rpc_set_passengers_status','rpc_move_reservation','rpc_start_trip','rpc_finish_trip')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Funções internas nunca chamadas pela API REST
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('fn_handle_new_auth_user','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Bootstrap de admin — 1º usuário do sistema vira 'admin'
--    (sem isto ninguém consegue gerir usuários/settings/veículos)
-- ---------------------------------------------------------------------
create or replace function public.fn_handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into users (id, name, role)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', NEW.email),
    case when (select count(*) from users) = 0 then 'admin'::user_role else 'atendente'::user_role end
  );
  return NEW;
end;
$$;
-- se você já criou seu login ANTES desta migration, rode manualmente:
--   update public.users set role = 'admin'
--   where id = (select id from auth.users order by created_at limit 1);

-- ---------------------------------------------------------------------
-- 6. USERS — uma policy por ação + (select …) para avaliar 1x por query
-- ---------------------------------------------------------------------
drop policy if exists users_select_self_or_admin on public.users;
drop policy if exists users_admin_manage        on public.users;
drop policy if exists users_select              on public.users;
drop policy if exists users_admin_insert        on public.users;
drop policy if exists users_admin_update        on public.users;
drop policy if exists users_admin_delete        on public.users;

create policy users_select on public.users for select
  using ( id = (select auth.uid())
          or (select public.fn_has_role(array['admin']::user_role[])) );
create policy users_admin_insert on public.users for insert
  with check ((select public.fn_has_role(array['admin']::user_role[])));
create policy users_admin_update on public.users for update
  using      ((select public.fn_has_role(array['admin']::user_role[])))
  with check ((select public.fn_has_role(array['admin']::user_role[])));
create policy users_admin_delete on public.users for delete
  using ((select public.fn_has_role(array['admin']::user_role[])));

-- ---------------------------------------------------------------------
-- 7. Índices de cobertura para FKs que são caminho real de join
-- ---------------------------------------------------------------------
create index if not exists idx_drivers_user_id               on public.drivers (user_id) where deleted_at is null;
create index if not exists idx_users_driver_id               on public.users (driver_id) where deleted_at is null;
create index if not exists idx_trips_vehicle                 on public.trips (vehicle_id) where deleted_at is null;
create index if not exists idx_reservations_route_point      on public.reservations (route_point_id) where deleted_at is null;
create index if not exists idx_fuel_trip                     on public.fuel_records (trip_id) where deleted_at is null;
create index if not exists idx_financial_entries_reservation on public.financial_entries (reservation_id) where deleted_at is null;
create index if not exists idx_notifications_customer        on public.notifications (customer_id);
create index if not exists idx_notifications_reservation     on public.notifications (reservation_id);
create index if not exists idx_occurrences_vehicle          on public.operational_occurrences (vehicle_id) where deleted_at is null;

commit;

-- =====================================================================
-- 8. (OPCIONAL, rodar SEPARADO) mover extensões para o schema 'extensions'.
--    Se der erro de dependência, ignore — é só cosmético.
-- =====================================================================
-- alter extension citext  set schema extensions;
-- alter extension pg_trgm set schema extensions;

-- =====================================================================
-- 9. CONFERÊNCIA — rode depois e verifique que não sobrou ERROR
-- =====================================================================
-- select c.relname,
--        (c.reloptions::text like '%security_invoker=on%') as invoker_ok
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relkind='v';
--
-- select proname, proconfig
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and proname like 'fn\_%';
--
-- select routine_name, grantee
--   from information_schema.role_routine_grants
--  where specific_schema='public' and routine_name like 'rpc\_%' and grantee='anon';
--  -- (esperado: nenhuma linha)
