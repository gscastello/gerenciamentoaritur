-- =====================================================================
-- ROTA PIRAPEMAS — 31: CENTRAL DE NOTIFICAÇÕES NO APP
-- =====================================================================
-- O dono pediu um sino no app que avise a equipe sobre:
--   - lotação  ......... uma viagem (data + direção) atingiu a capacidade
--   - cancelamento ..... um passageiro cancelou
--   - mudança de embarque / desembarque (é comum o passageiro mudar)
--
-- Isto é SEPARADO da tabela `notifications` (fila de envio do WhatsApp).
-- Aqui é um mural interno: uma linha por evento, estado "lida" POR
-- usuário (cada sócio marca as suas). Escrita só por trigger / service.
--
-- Rodar depois de 01-30. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.app_notifications (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in (
                   'lotacao', 'cancelamento', 'mudanca_embarque', 'mudanca_desembarque')),
  title          text not null,
  body           text not null default '',
  reservation_id uuid references public.reservations(id) on delete set null,
  trip_date      date,
  direction      trip_direction,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_app_notifications_created
  on public.app_notifications (created_at desc);

-- Estado "lida" por usuário.
create table if not exists public.app_notification_reads (
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.app_notifications      enable row level security;
alter table public.app_notification_reads enable row level security;

-- Mural: leitura para os papéis operacionais. Ninguém escreve direto
-- (só as triggers, security definer / service_role).
drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select on public.app_notifications for select
  to authenticated
  using (fn_has_role(array['admin','atendente','motorista','financeiro']::user_role[]));

-- Cada usuário gerencia só as SUAS marcações de leitura.
drop policy if exists app_notification_reads_select on public.app_notification_reads;
create policy app_notification_reads_select on public.app_notification_reads for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists app_notification_reads_insert on public.app_notification_reads;
create policy app_notification_reads_insert on public.app_notification_reads for insert
  to authenticated
  with check (user_id = (select auth.uid()));

grant select on public.app_notifications      to authenticated, service_role;
grant select, insert on public.app_notification_reads to authenticated, service_role;

-- ---------------------------------------------------------------------
-- View: o mural já com "lida" resolvido para o usuário da sessão.
-- ---------------------------------------------------------------------
create or replace view public.v_app_notifications
with (security_invoker = true) as
select n.id, n.kind, n.title, n.body, n.reservation_id, n.trip_date,
       n.direction, n.meta, n.created_at,
       exists (
         select 1 from public.app_notification_reads r
         where r.notification_id = n.id and r.user_id = (select auth.uid())
       ) as lida
from public.app_notifications n
order by n.created_at desc;

grant select on public.v_app_notifications to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helper de escrita (bypassa a RLS de escrita — só as triggers usam).
-- ---------------------------------------------------------------------
create or replace function public.fn_app_notify(
  p_kind text, p_title text, p_body text,
  p_reservation_id uuid, p_trip_date date, p_direction trip_direction,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_notifications
    (kind, title, body, reservation_id, trip_date, direction, meta)
  values
    (p_kind, p_title, p_body, p_reservation_id, p_trip_date, p_direction, coalesce(p_meta, '{}'::jsonb));
end;
$$;
revoke execute on function public.fn_app_notify(text,text,text,uuid,date,trip_direction,jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger 1: cancelamento + mudança de embarque / desembarque
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_reservation_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nome text;
  v_data date;
  v_dir  trip_direction;
  v_quando text;
begin
  if NEW.type <> 'passagem' then
    return NEW;
  end if;

  select c.name into v_nome from customers c where c.id = NEW.customer_id;
  select t.trip_date, t.direction into v_data, v_dir from trips t where t.id = NEW.trip_id;
  v_quando := coalesce(to_char(v_data, 'DD/MM'), 'data a definir');
  v_nome := coalesce(nullif(trim(v_nome), ''), 'Passageiro');

  -- cancelamento
  if NEW.status = 'cancelada' and OLD.status is distinct from 'cancelada' then
    perform fn_app_notify(
      'cancelamento',
      format('Cancelamento — %s', v_nome),
      format('%s cancelou a viagem de %s (%s).', v_nome, v_quando,
             coalesce(v_dir::text, '—')),
      NEW.id, v_data, v_dir, '{}'::jsonb);
    return NEW;  -- cancelou: não faz sentido avisar de mudança de endereço junto
  end if;

  if NEW.deleted_at is not null or NEW.status = 'cancelada' then
    return NEW;
  end if;

  -- mudança de desembarque
  if NEW.dropoff_location   is distinct from OLD.dropoff_location
     or NEW.dropoff_area    is distinct from OLD.dropoff_area
     or NEW.dropoff_detail  is distinct from OLD.dropoff_detail then
    perform fn_app_notify(
      'mudanca_desembarque',
      format('Mudança de desembarque — %s', v_nome),
      format('Viagem de %s · novo desembarque: %s', v_quando,
             coalesce(nullif(trim(NEW.dropoff_location), ''),
                      nullif(trim(NEW.dropoff_detail), ''), '—')),
      NEW.id, v_data, v_dir,
      jsonb_build_object('de', OLD.dropoff_location, 'para', NEW.dropoff_location));
  end if;

  -- mudança de embarque
  if NEW.route_point_id       is distinct from OLD.route_point_id
     or NEW.pickup_neighborhood is distinct from OLD.pickup_neighborhood
     or NEW.street            is distinct from OLD.street
     or NEW.pickup_detail     is distinct from OLD.pickup_detail then
    perform fn_app_notify(
      'mudanca_embarque',
      format('Mudança de embarque — %s', v_nome),
      format('Viagem de %s · novo embarque: %s', v_quando,
             coalesce(nullif(trim(NEW.pickup_neighborhood), ''),
                      nullif(trim(NEW.street), ''),
                      nullif(trim(NEW.pickup_detail), ''), '—')),
      NEW.id, v_data, v_dir,
      jsonb_build_object('de', OLD.pickup_neighborhood, 'para', NEW.pickup_neighborhood));
  end if;

  return NEW;
end;
$$;

-- funções de trigger não são para chamada via RPC (advisor 0028/0029)
revoke execute on function public.fn_notify_reservation_change() from public, anon, authenticated;

drop trigger if exists trg_notify_reservation_change on public.reservations;
create trigger trg_notify_reservation_change
  after update on public.reservations
  for each row execute function public.fn_notify_reservation_change();

-- ---------------------------------------------------------------------
-- Trigger 2: lotação — quando a viagem enche (uma vez por viagem/12h)
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_trip_full() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip_id uuid;
  v_cap  int;
  v_occ  int;
  v_data date;
  v_dir  trip_direction;
begin
  if NEW.status not in ('confirmado', 'embarcado') then
    return NEW;
  end if;

  select r.trip_id into v_trip_id from reservations r where r.id = NEW.reservation_id;
  if v_trip_id is null then
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

revoke execute on function public.fn_notify_trip_full() from public, anon, authenticated;

drop trigger if exists trg_notify_trip_full on public.reservation_passengers;
create trigger trg_notify_trip_full
  after insert or update of status on public.reservation_passengers
  for each row execute function public.fn_notify_trip_full();

-- ---------------------------------------------------------------------
-- RPCs: marcar como lida
-- ---------------------------------------------------------------------
create or replace function public.rpc_mark_notifications_read(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Sem sessão.');
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('success', true, 'marcadas', 0);
  end if;
  insert into app_notification_reads (notification_id, user_id)
  select unnest(p_ids), v_actor
  on conflict (notification_id, user_id) do nothing;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_mark_notifications_read(uuid[]) from public, anon;
grant  execute on function public.rpc_mark_notifications_read(uuid[]) to authenticated, service_role;

create or replace function public.rpc_mark_all_notifications_read()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'message', 'Sem sessão.');
  end if;
  insert into app_notification_reads (notification_id, user_id)
  select n.id, v_actor
  from app_notifications n
  where not exists (
    select 1 from app_notification_reads r
    where r.notification_id = n.id and r.user_id = v_actor
  );
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_mark_all_notifications_read() from public, anon;
grant  execute on function public.rpc_mark_all_notifications_read() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.app_notifications;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.app_notification_reads;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select kind, title, trip_date, direction, created_at from v_app_notifications limit 20;
--   select public.rpc_mark_all_notifications_read();
