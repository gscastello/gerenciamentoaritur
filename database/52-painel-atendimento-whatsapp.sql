-- =====================================================================
-- ROTA PIRAPEMAS — 52: PAINEL DE ATENDIMENTO WHATSAPP (espelho do Chatwoot)
-- =====================================================================
-- A aba "Atendimento" do app mostra a fila do Chatwoot sem guardar token
-- do Chatwoot no navegador: a Edge Function `chatwoot-bot` recebe os
-- eventos (mensagem, mudança de status) e espelha o estado em
-- whatsapp_conversations; o app lê isso (com Realtime).
--
--   • colunas-espelho em whatsapp_conversations
--   • fn_variantes_telefone — mesma regra do bot (com/sem nono dígito)
--   • v_atendimento_whatsapp — conversa + nome do CADASTRO (customers) ao
--     lado do nome do perfil do WhatsApp (que costuma ser apelido/fictício)
--   • bot_unanswered — perguntas que o bot não soube responder
--   • settings.chatwoot — link base pra "Abrir no Chatwoot"
--
-- Pré-requisito: 06-whatsapp.sql, 48 e 51 aplicados.
-- Rodar depois de 01-51. Idempotente.
-- =====================================================================

alter table public.whatsapp_conversations
  add column if not exists chatwoot_status        text,
  add column if not exists chatwoot_contact_id    bigint,
  add column if not exists chatwoot_contact_name  text,
  add column if not exists last_message_by        text check (last_message_by in ('cliente', 'equipe', 'bot')),
  add column if not exists last_message_preview   text,
  add column if not exists last_message_at        timestamptz;

create index if not exists idx_wa_conversations_fila
  on public.whatsapp_conversations (chatwoot_status, last_message_at desc)
  where deleted_at is null and chatwoot_conversation_id is not null;

-- Formas equivalentes do mesmo celular (com e sem o nono dígito). Espelha
-- variantesTelefone() de supabase/functions/_shared/telefone.ts.
create or replace function public.fn_variantes_telefone(p_telefone text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  with n as (select public.fn_normalizar_telefone(p_telefone) as v)
  select array_remove(array[
    v,
    case when length(v) = 10 and substr(v, 3, 1) ~ '[6-9]'
         then substr(v, 1, 2) || '9' || substr(v, 3) end,
    case when length(v) = 11 and substr(v, 3, 1) = '9' and substr(v, 4, 1) ~ '[6-9]'
         then substr(v, 1, 2) || substr(v, 4) end
  ], null)
  from n
$$;

create or replace view public.v_atendimento_whatsapp
with (security_invoker = true) as
select
  w.id                       as conversation_id,
  w.chatwoot_conversation_id,
  w.phone,
  w.chatwoot_contact_name    as nome_whatsapp,
  c.id                       as customer_id,
  c.name                     as nome_cadastro,
  w.chatwoot_status          as status,
  w.attendance_mode::text    as modo,
  w.last_message_by,
  w.last_message_preview     as previa,
  w.last_message_at,
  (w.chatwoot_status = 'open' and w.last_message_by = 'cliente') as aguardando_equipe
from public.whatsapp_conversations w
left join lateral (
  select cu.id, cu.name
  from public.customers cu
  where cu.deleted_at is null
    and cu.phone = any (public.fn_variantes_telefone(w.phone))
  order by cu.created_at
  limit 1
) c on true
where w.deleted_at is null
  and w.chatwoot_conversation_id is not null;

grant select on public.v_atendimento_whatsapp to authenticated;

-- Perguntas fora do roteiro que a base de conhecimento não cobria: o bot
-- grava (service_role), a equipe responde cadastrando na base e marca como
-- resolvida.
create table if not exists public.bot_unanswered (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.whatsapp_conversations(id),
  question         text not null,
  reason           text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.users(id)
);
create index if not exists idx_bot_unanswered_abertas
  on public.bot_unanswered (created_at desc) where resolved_at is null;

alter table public.bot_unanswered enable row level security;

drop policy if exists bot_unanswered_select on public.bot_unanswered;
create policy bot_unanswered_select on public.bot_unanswered
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

drop policy if exists bot_unanswered_update on public.bot_unanswered;
create policy bot_unanswered_update on public.bot_unanswered
  for update
  using (fn_has_role(array['admin', 'atendente']::user_role[]))
  with check (fn_has_role(array['admin', 'atendente']::user_role[]));

revoke all on public.bot_unanswered from anon;
grant select on public.bot_unanswered to authenticated;
grant update (resolved_at, resolved_by) on public.bot_unanswered to authenticated;

-- Link base do Chatwoot (conta) pro botão "Abrir no Chatwoot".
insert into public.settings (key, value)
values ('chatwoot', '{"url": "https://app.chatwoot.com/app/accounts/188239"}'::jsonb)
on conflict (key) do nothing;

-- Realtime: a fila e as perguntas atualizam sozinhas na tela.
do $$
declare t text;
begin
  foreach t in array array['whatsapp_conversations', 'bot_unanswered'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
