-- =====================================================================
-- ROTA PIRAPEMAS — 36: MONITORAMENTO — log de erros da aplicação
-- =====================================================================
-- Onde os erros já ficam registrados hoje:
--   - erros do bot / integração WhatsApp .... whatsapp_messages + a fila
--     `notifications` (status 'falha', coluna `error`)
--   - ações de negócio ...................... audit_logs
--   - erros de front (se Sentry ligado) ..... Sentry
--
-- O que faltava: um lugar SEMPRE disponível (sem depender de conta
-- externa) para o erro que o usuário viu no app. `app_error_log` +
-- `rpc_log_client_error` — o admin lê na aba Sistema.
--
-- Rodar depois de 01-35. Idempotente.
-- =====================================================================

create table if not exists public.app_error_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  user_id     uuid references public.users(id) on delete set null,
  message     text not null,
  code        text,
  context     jsonb not null default '{}'::jsonb,
  url         text,
  user_agent  text
);
create index if not exists idx_app_error_log_at on public.app_error_log (at desc);

alter table public.app_error_log enable row level security;

-- leitura: só admin (é informação técnica)
drop policy if exists app_error_log_select on public.app_error_log;
create policy app_error_log_select on public.app_error_log for select
  to authenticated
  using (fn_has_role(array['admin']::user_role[]));

grant select on public.app_error_log to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: o frontend grava aqui (logTecnico em lib/erros.js). Rate-limit
-- por usuário: no máx. 30 erros/minuto (evita tempestade de logs).
-- ---------------------------------------------------------------------
create or replace function public.rpc_log_client_error(
  p_message text, p_code text default null, p_context jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_recentes int;
begin
  if p_message is null or btrim(p_message) = '' then
    return;
  end if;
  select count(*) into v_recentes from app_error_log
    where user_id is not distinct from v_actor and at > now() - interval '1 minute';
  if v_recentes >= 30 then
    return;
  end if;
  insert into app_error_log (user_id, message, code, context, url, user_agent)
  values (
    v_actor,
    left(p_message, 1000),
    nullif(left(p_code, 60), ''),
    coalesce(p_context, '{}'::jsonb) - 'url' - 'user_agent',
    left(p_context->>'url', 500),
    left(p_context->>'user_agent', 300));
end;
$$;
revoke execute on function public.rpc_log_client_error(text, text, jsonb) from public, anon;
grant  execute on function public.rpc_log_client_error(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Retenção: mantém 30 dias.
-- ---------------------------------------------------------------------
create or replace function public.fn_purge_error_log() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.app_error_log where at < now() - interval '30 days';
$$;
revoke execute on function public.fn_purge_error_log() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('purge-error-log', '17 4 * * *', 'select public.fn_purge_error_log();');
exception when others then null;  -- pg_cron pode não estar disponível
end $$;

-- Conferir:
--   select at, message, code, user_id from app_error_log order by at desc limit 20;
