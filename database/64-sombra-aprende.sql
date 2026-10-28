-- =====================================================================
-- ROTA PIRAPEMAS — 64: MODO SOMBRA OBSERVA E APRENDE (#218)
-- =====================================================================
-- Rodar depois de 01–63. Idempotente.
-- No modo sombra o bot passa a OBSERVAR as conversas e a aprender com elas:
--   bot_observations  texto bruto observado (cliente, atendente e o rascunho
--                     que o bot teria enviado). Só texto; guardado 90 dias.
--   bot_learnings     lições aprendidas, SEM nomes nem telefones:
--                       linguagem_cliente   como os clientes escrevem/pedem
--                       estilo_atendente    como o atendente responde
--                       fluxo_agendamento   como o atendente agenda as passagens
--                       fato                informação dita pelo atendente (preço,
--                                           regra, horário…) — só vale APROVADA
--                     linguagem/estilo/fluxo já entram valendo (status 'ativa',
--                     needs_review = true até o dono conferir); fato nasce
--                     'proposta' e só passa a valer quando o dono aprova.
-- O texto bruto só é lido pelo admin; as lições, por admin/atendente. Quem grava
-- é a Edge Function (service_role). Remoção/arquivo é troca de status.
-- =====================================================================

create table if not exists public.bot_observations (
  id                       uuid primary key default gen_random_uuid(),
  conversation_id          uuid,
  chatwoot_conversation_id bigint not null,
  chatwoot_message_id      bigint,
  author                   text not null check (author in ('cliente', 'equipe', 'bot_rascunho')),
  content                  text not null check (length(btrim(content)) > 0 and length(content) <= 2000),
  created_at               timestamptz not null default now(),
  processed_at             timestamptz
);
create unique index if not exists uq_bot_observations_msg
  on public.bot_observations (chatwoot_message_id) where chatwoot_message_id is not null;
create index if not exists idx_bot_observations_pendentes
  on public.bot_observations (created_at) where processed_at is null;
create index if not exists idx_bot_observations_created
  on public.bot_observations (created_at);

alter table public.bot_observations enable row level security;
drop policy if exists bot_observations_select on public.bot_observations;
create policy bot_observations_select on public.bot_observations
  for select using (fn_has_role(array['admin']::user_role[]));
revoke all on public.bot_observations from anon, authenticated;
grant select on public.bot_observations to authenticated;

create table if not exists public.bot_learnings (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('linguagem_cliente', 'estilo_atendente', 'fluxo_agendamento', 'fato')),
  title          text not null check (length(btrim(title)) between 3 and 120),
  content        text not null check (length(btrim(content)) between 10 and 800),
  status         text not null default 'proposta' check (status in ('ativa', 'proposta', 'recusada', 'arquivada')),
  needs_review   boolean not null default true,
  evidence_count integer not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists uq_bot_learnings_titulo
  on public.bot_learnings (kind, lower(btrim(title))) where status in ('ativa', 'proposta');
create index if not exists idx_bot_learnings_status on public.bot_learnings (status, kind);

alter table public.bot_learnings enable row level security;
drop policy if exists bot_learnings_select on public.bot_learnings;
create policy bot_learnings_select on public.bot_learnings
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
drop policy if exists bot_learnings_update on public.bot_learnings;
create policy bot_learnings_update on public.bot_learnings
  for update using (fn_has_role(array['admin']::user_role[]))
  with check (fn_has_role(array['admin']::user_role[]));
revoke all on public.bot_learnings from anon, authenticated;
grant select on public.bot_learnings to authenticated;
grant update (title, content, status, needs_review, reviewed_at, reviewed_by, updated_at)
  on public.bot_learnings to authenticated;

create or replace function public.fn_bot_learnings_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_bot_learnings_touch on public.bot_learnings;
create trigger trg_bot_learnings_touch
  before update on public.bot_learnings
  for each row execute function public.fn_bot_learnings_touch();

-- ---------------------------------------------------------------------
-- Estado do aprendizado automático (evita rodar duas vezes ao mesmo tempo
-- e espaça as execuções). Devolve true para UM chamador por janela.
-- ---------------------------------------------------------------------
insert into public.settings (key, value)
  values ('bot_learning_state', jsonb_build_object('last_run_at', '2000-01-01T00:00:00Z'))
  on conflict (key) do nothing;

create or replace function public.fn_bot_learning_try_start(p_min_hours integer default 6)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer;
begin
  update settings
     set value = jsonb_build_object('last_run_at', now())
   where key = 'bot_learning_state'
     and (value ->> 'last_run_at')::timestamptz < now() - make_interval(hours => greatest(p_min_hours, 0));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke execute on function public.fn_bot_learning_try_start(integer) from public, anon, authenticated;
grant  execute on function public.fn_bot_learning_try_start(integer) to service_role;

-- ---------------------------------------------------------------------
-- Números da tela Sistema → Bot → Aprendizado (admin/atendente).
-- ---------------------------------------------------------------------
create or replace function public.rpc_bot_learning_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  return jsonb_build_object(
    'success', true,
    'observacoes', (select count(*) from bot_observations),
    'pendentes', (select count(*) from bot_observations where processed_at is null),
    'ultima_observacao', (select max(created_at) from bot_observations),
    'ultimo_aprendizado', (select value ->> 'last_run_at' from settings where key = 'bot_learning_state'),
    'dias_guardados', 90
  );
end;
$$;
revoke execute on function public.rpc_bot_learning_stats() from public, anon;
grant  execute on function public.rpc_bot_learning_stats() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Retenção: o texto bruto some depois de 90 dias (as lições ficam).
-- ---------------------------------------------------------------------
create or replace function public.fn_purge_bot_observations()
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  delete from bot_observations where created_at < now() - interval '90 days';
$$;
revoke execute on function public.fn_purge_bot_observations() from public, anon, authenticated;
grant  execute on function public.fn_purge_bot_observations() to service_role;

select cron.schedule(
  'purge-bot-observations',
  '10 4 * * *',
  $cron$ select public.fn_purge_bot_observations(); $cron$
);

-- Conferir:
--   select kind, status, needs_review, evidence_count, title from bot_learnings order by last_seen_at desc;
--   select author, count(*) from bot_observations group by 1;
--   select jobname, schedule from cron.job where jobname = 'purge-bot-observations';
