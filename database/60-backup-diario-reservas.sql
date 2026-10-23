-- =====================================================================
-- ROTA PIRAPEMAS — 60: backup diário de todas as reservas do dia (#208)
-- =====================================================================
-- Rodar depois de 01–59. Idempotente.
-- Já existe o backup COMPLETO diário (database/17, 03h, últimos 30). Este
-- guarda UMA CÓPIA POR DIA DE VIAGEM: todas as reservas daquele dia —
-- inclusive canceladas e apagadas — com cliente, passageiros e pagamentos,
-- às 23h55 de São Luís, por 400 dias. Consultável e baixável em
-- Sistema → Backup diário das reservas.
--   Refazer o mesmo dia SUBSTITUI a cópia daquele dia (uma por dia).
-- =====================================================================

create table if not exists public.reservation_day_backups (
  id                  uuid primary key default gen_random_uuid(),
  backup_date         date not null,
  taken_at            timestamptz not null default now(),
  origem              text not null default 'automatico' check (origem in ('automatico', 'manual')),
  taken_by            uuid references public.users(id),
  reservas_total      integer not null default 0,
  reservas_canceladas integer not null default 0,
  passagens           integer not null default 0,
  size_bytes          integer not null default 0,
  data                jsonb not null
);
create unique index if not exists uq_reservation_day_backups_date
  on public.reservation_day_backups (backup_date);

alter table public.reservation_day_backups enable row level security;
drop policy if exists reservation_day_backups_select on public.reservation_day_backups;
create policy reservation_day_backups_select on public.reservation_day_backups for select
  using (fn_has_role(array['admin', 'atendente']::user_role[]));
-- Ninguém grava direto: só as funções SECURITY DEFINER abaixo.
revoke all on public.reservation_day_backups from authenticated, anon;
grant select on public.reservation_day_backups to authenticated;

-- ---------------------------------------------------------------------
-- Monta o retrato do dia. Interna (nunca chamada direto pelo cliente).
-- ---------------------------------------------------------------------
create or replace function public.fn_assemble_reservas_do_dia(p_date date)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'versao', 1,
    'dia', p_date,
    'gerado_em', now(),
    'reservas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'reserva', to_jsonb(r),
          'cliente', jsonb_build_object(
            'id', c.id, 'nome', c.name, 'telefone', c.phone, 'telefone2', c.phone_secondary),
          'viagem', jsonb_build_object('id', t.id, 'data', t.trip_date, 'direcao', t.direction),
          'ponto', jsonb_build_object('codigo', rp.code, 'nome', rp.name),
          'passageiros', coalesce((
            select jsonb_agg(to_jsonb(x) order by x.seq)
              from reservation_passengers x where x.reservation_id = r.id), '[]'::jsonb),
          'pagamentos', coalesce((
            select jsonb_agg(to_jsonb(p))
              from payments p where p.reservation_id = r.id), '[]'::jsonb)
        )
        order by t.direction, rp.display_order nulls last, r.created_at
      )
      from reservations r
      join trips t on t.id = r.trip_id
      left join customers c on c.id = r.customer_id
      left join route_points rp on rp.id = r.route_point_id
      where t.trip_date = p_date
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.fn_assemble_reservas_do_dia(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Grava (ou substitui) a cópia do dia. Interna.
-- ---------------------------------------------------------------------
create or replace function public.fn_backup_reservas_do_dia(
  p_date   date,
  p_origem text default 'automatico',
  p_actor  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_data       jsonb;
  v_total      integer;
  v_canceladas integer;
  v_passagens  integer;
  v_id         uuid;
begin
  v_data := fn_assemble_reservas_do_dia(p_date);
  v_total := jsonb_array_length(v_data->'reservas');
  select count(*) filter (where e->'reserva'->>'status' = 'cancelada'),
         coalesce(sum((e->'reserva'->>'quantity')::integer) filter (
           where e->'reserva'->>'status' <> 'cancelada'
             and e->'reserva'->>'deleted_at' is null
             and e->'reserva'->>'type' = 'passagem'), 0)
    into v_canceladas, v_passagens
    from jsonb_array_elements(v_data->'reservas') e;

  insert into reservation_day_backups
    (backup_date, taken_at, origem, taken_by, reservas_total, reservas_canceladas, passagens, size_bytes, data)
  values
    (p_date, now(), p_origem, p_actor, v_total, v_canceladas, v_passagens, pg_column_size(v_data), v_data)
  on conflict (backup_date) do update
    set taken_at = excluded.taken_at, origem = excluded.origem, taken_by = excluded.taken_by,
        reservas_total = excluded.reservas_total, reservas_canceladas = excluded.reservas_canceladas,
        passagens = excluded.passagens, size_bytes = excluded.size_bytes, data = excluded.data
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id, 'dia', p_date,
    'reservas_total', v_total, 'reservas_canceladas', v_canceladas, 'passagens', v_passagens);
end;
$$;
revoke execute on function public.fn_backup_reservas_do_dia(date, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- "Fazer backup agora" (admin/atendente). Sem data = hoje (São Luís).
-- ---------------------------------------------------------------------
create or replace function public.rpc_backup_reservas_do_dia(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  return fn_backup_reservas_do_dia(
    coalesce(p_date, (now() at time zone 'America/Fortaleza')::date), 'manual', auth.uid());
end;
$$;
revoke execute on function public.rpc_backup_reservas_do_dia(date) from public, anon;
grant  execute on function public.rpc_backup_reservas_do_dia(date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Rotina diária: 23:55 de São Luís (= 02:55 UTC) copia as reservas do dia.
-- Guarda 400 dias.
-- ---------------------------------------------------------------------
create or replace function public.fn_run_backup_reservas_do_dia()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform fn_backup_reservas_do_dia((now() at time zone 'America/Fortaleza')::date, 'automatico', null);
  delete from reservation_day_backups where backup_date < current_date - 400;
end;
$$;
revoke execute on function public.fn_run_backup_reservas_do_dia() from public, anon, authenticated;
grant  execute on function public.fn_run_backup_reservas_do_dia() to service_role;

select cron.schedule(
  'backup-reservas-do-dia',
  '55 2 * * *',
  $cron$ select public.fn_run_backup_reservas_do_dia(); $cron$
);

-- Já guarda a cópia de hoje (não espera a primeira noite).
select public.fn_backup_reservas_do_dia((now() at time zone 'America/Fortaleza')::date, 'automatico', null);

-- Conferir:
--   select backup_date, taken_at, origem, reservas_total, reservas_canceladas, passagens from reservation_day_backups order by backup_date desc;
--   select jobname, schedule from cron.job where jobname = 'backup-reservas-do-dia';
