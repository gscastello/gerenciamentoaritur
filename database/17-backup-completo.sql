-- =====================================================================
-- ROTA PIRAPEMAS — 17: Backup completo gerado pelo servidor + automáticos
-- =====================================================================
-- Rodar depois de 01–16. Junta TODAS as tabelas de negócio num único
-- jsonb (inclusive linhas soft-deleted — um backup "pra nunca perder
-- dado" não pode excluir histórico apagado por engano). Guarda em
-- system_backups (histórico consultável), com um cron diário mantendo
-- os últimos 30 automáticos (e a mesma retenção para os manuais).

create table if not exists public.system_backups (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id),          -- null = gerado pelo cron
  origem        text not null default 'manual' check (origem in ('manual','automatico')),
  payload       jsonb not null,
  tamanho_bytes integer not null
);

alter table public.system_backups enable row level security;

create policy system_backups_select on public.system_backups for select
  using (fn_has_role(array['admin']::user_role[]));

-- Ninguém grava direto — só as funções SECURITY DEFINER abaixo (rodam
-- como o dono, não como authenticated/anon).
revoke all on public.system_backups from authenticated, anon;
grant select on public.system_backups to authenticated;

-- ---------------------------------------------------------------------
-- Monta o jsonb completo. Função interna — nunca chamada direto pelo
-- cliente (só por rpc_generate_backup / fn_run_scheduled_backup, que
-- rodam como o dono da função sob SECURITY DEFINER).
-- ---------------------------------------------------------------------
create or replace function public.fn_assemble_backup()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'gerado_em',      now(),
    'versao',         1,
    'clientes',       coalesce((select jsonb_agg(to_jsonb(t)) from customers t), '[]'::jsonb),
    'reservas',       coalesce((select jsonb_agg(to_jsonb(t)) from reservations t), '[]'::jsonb),
    'passageiros',    coalesce((select jsonb_agg(to_jsonb(t)) from reservation_passengers t), '[]'::jsonb),
    'viagens',        coalesce((select jsonb_agg(to_jsonb(t)) from trips t), '[]'::jsonb),
    'veiculos',       coalesce((select jsonb_agg(to_jsonb(t)) from vehicles t), '[]'::jsonb),
    'motoristas',     coalesce((select jsonb_agg(to_jsonb(t)) from drivers t), '[]'::jsonb),
    'combustivel',    coalesce((select jsonb_agg(to_jsonb(t)) from fuel_records t), '[]'::jsonb),
    'manutencoes',    coalesce((select jsonb_agg(to_jsonb(t)) from maintenance t), '[]'::jsonb),
    'pagamentos',     coalesce((select jsonb_agg(to_jsonb(t)) from payments t), '[]'::jsonb),
    'financeiro',     coalesce((select jsonb_agg(to_jsonb(t)) from financial_entries t), '[]'::jsonb),
    'pontos_rota',    coalesce((select jsonb_agg(to_jsonb(t)) from route_points t), '[]'::jsonb),
    'precos_bairro',  coalesce((select jsonb_agg(to_jsonb(t)) from neighborhood_pricing t), '[]'::jsonb),
    'configuracoes',  coalesce((select jsonb_agg(to_jsonb(t)) from settings t), '[]'::jsonb),
    'usuarios',       coalesce((select jsonb_agg(to_jsonb(t)) from users t), '[]'::jsonb),
    'logs',           coalesce((select jsonb_agg(to_jsonb(t) order by t.performed_at desc) from audit_logs t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.fn_assemble_backup() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Gera agora, sob demanda (botão "Gerar backup completo"). Só admin.
-- ---------------------------------------------------------------------
create or replace function public.rpc_generate_backup()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_payload jsonb;
  v_actor   uuid;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Só admin pode gerar backup completo.');
  end if;

  v_actor := auth.uid();
  v_payload := fn_assemble_backup();

  insert into system_backups (created_by, origem, payload, tamanho_bytes)
  values (v_actor, 'manual', v_payload, pg_column_size(v_payload));

  -- retenção: mantém só os últimos 30 backups MANUAIS (automáticos têm a
  -- própria retenção em fn_run_scheduled_backup).
  delete from system_backups
   where origem = 'manual'
     and id not in (
       select id from system_backups where origem = 'manual'
       order by created_at desc limit 30
     );

  return jsonb_build_object('success', true) || v_payload;
end;
$$;
revoke execute on function public.rpc_generate_backup() from public, anon;
grant  execute on function public.rpc_generate_backup() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Cron diário — backup automático, sem depender de ninguém abrir o app.
-- ---------------------------------------------------------------------
create or replace function public.fn_run_scheduled_backup()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_payload jsonb;
begin
  v_payload := fn_assemble_backup();

  insert into system_backups (created_by, origem, payload, tamanho_bytes)
  values (null, 'automatico', v_payload, pg_column_size(v_payload));

  delete from system_backups
   where origem = 'automatico'
     and id not in (
       select id from system_backups where origem = 'automatico'
       order by created_at desc limit 30
     );
end;
$$;
revoke execute on function public.fn_run_scheduled_backup() from public, anon, authenticated;
grant  execute on function public.fn_run_scheduled_backup() to service_role;

-- 06:00 UTC = 03:00 em São Luís (madrugada, baixo tráfego). O banco já
-- está no fuso de São Luís (16-timezone-sao-luis.sql) — current_date/
-- now() dentro da função rodam corretos independente do horário UTC do
-- disparo do cron.
select cron.schedule(
  'daily-system-backup',
  '0 6 * * *',
  $cron$ select public.fn_run_scheduled_backup(); $cron$
);

-- roda uma vez agora, pra já existir pelo menos 1 backup no histórico
select public.fn_run_scheduled_backup();

-- Conferir:
--   select id, created_at, origem, tamanho_bytes from system_backups order by created_at desc;
--   select * from cron.job where jobname = 'daily-system-backup';
