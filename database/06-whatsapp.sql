-- =====================================================================
-- ROTA PIRAPEMAS — 06: WHATSAPP (conversas, mensagens, modo de atendimento)
-- =====================================================================
-- Rodar depois de 01-05. Não mexe nas tabelas de negócio (reservations,
-- trips etc.) — só adiciona o necessário para o canal de WhatsApp.

create type wa_attendance_mode as enum ('ia', 'humano');
create type wa_message_direction as enum ('inbound', 'outbound');
create type wa_message_type as enum ('text', 'interactive', 'template', 'button', 'system');

-- ---------------------------------------------------------------------
-- Usuário de sistema para atribuir as ações da IA na auditoria
-- ---------------------------------------------------------------------
-- IMPORTANTE: crie primeiro um usuário no Supabase Auth (pode ser um
-- e-mail tipo bot@suaempresa.com, sem necessidade de fazer login humano
-- nunca) e troque o UUID abaixo pelo id gerado. Isso é necessário porque
-- users.id referencia auth.users(id) (ver 01-schema.sql).
insert into users (id, name, role)
select id, 'Bot WhatsApp', 'atendente'
from auth.users where email = 'bot@rota-pirapemas.local'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- WHATSAPP_CONVERSATIONS — um registro por número de telefone
-- ---------------------------------------------------------------------
create table whatsapp_conversations (
  id                uuid primary key default gen_random_uuid(),
  phone             text not null,                 -- formato E.164, ex: 5598981012388
  customer_id       uuid references customers(id),
  attendance_mode   wa_attendance_mode not null default 'ia',
  assigned_user_id  uuid references users(id),      -- atendente que assumiu esta conversa (se houver)
  state             jsonb not null default '{"step":"idle"}'::jsonb,  -- máquina de estados da conversa
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references users(id),
  updated_by        uuid references users(id),
  deleted_at        timestamptz
);
create unique index uq_wa_conversations_phone on whatsapp_conversations (phone) where deleted_at is null;
create index idx_wa_conversations_mode on whatsapp_conversations (attendance_mode) where deleted_at is null;
create index idx_wa_conversations_customer on whatsapp_conversations (customer_id) where deleted_at is null;
create index idx_wa_conversations_assigned on whatsapp_conversations (assigned_user_id) where deleted_at is null;
create trigger trg_wa_conversations_updated_at before update on whatsapp_conversations
  for each row execute function fn_set_updated_at();

-- ---------------------------------------------------------------------
-- WHATSAPP_MESSAGES — log bruto de tudo que entra e sai (idempotência +
-- auditoria de conversa, independente do audit_logs de ações de negócio)
-- ---------------------------------------------------------------------
create table whatsapp_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references whatsapp_conversations(id),
  wa_message_id     text,                           -- id da mensagem no WhatsApp (dedupe de webhook)
  direction         wa_message_direction not null,
  message_type      wa_message_type not null default 'text',
  content           jsonb not null default '{}'::jsonb,
  intent_detected   text,                            -- ex: 'reservar_ida', 'cancelar', 'falar_atendente'
  created_at        timestamptz not null default now()
);
create unique index uq_wa_messages_wa_id on whatsapp_messages (wa_message_id) where wa_message_id is not null;
create index idx_wa_messages_conversation on whatsapp_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

-- leitura: admin/atendente/financeiro (para acompanhar); motorista não precisa
create policy wa_conversations_select on whatsapp_conversations for select
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]) and deleted_at is null);
create policy wa_conversations_update on whatsapp_conversations for update
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy wa_messages_select on whatsapp_messages for select
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]));

-- a Edge Function usa a service_role key (ignora RLS) — não há policy de
-- INSERT para papéis normais porque só o bot deve escrever aqui.

-- ---------------------------------------------------------------------
-- Helper: modo de atendimento EFETIVO de uma conversa = HUMANO se o
-- global OU o da conversa estiver em HUMANO.
-- ---------------------------------------------------------------------
create or replace function fn_effective_attendance_mode(p_conversation_id uuid)
returns wa_attendance_mode language sql stable set search_path = public, pg_temp as $$
  select case
    when (select (value->>'mode') from settings where key = 'attendance_mode') = 'manual' then 'humano'::wa_attendance_mode
    when (select attendance_mode from whatsapp_conversations where id = p_conversation_id) = 'humano' then 'humano'::wa_attendance_mode
    else 'ia'::wa_attendance_mode
  end
$$;

-- ---------------------------------------------------------------------
-- Transferir conversa para humano (usada tanto pela IA quanto por um
-- atendente clicando "assumir" no painel)
-- ---------------------------------------------------------------------
create or replace function rpc_transfer_to_human(
  p_conversation_id uuid,
  p_reason text default null,
  p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_conversations
    set attendance_mode = 'humano', assigned_user_id = p_actor, updated_by = p_actor
    where id = p_conversation_id;

  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
    values ('whatsapp_conversations', p_conversation_id, 'status_change',
            jsonb_build_object('attendance_mode', 'humano', 'reason', p_reason), p_actor);

  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function rpc_transfer_to_human(uuid, text, uuid) from public, anon;
grant  execute on function rpc_transfer_to_human(uuid, text, uuid) to authenticated, service_role;

create or replace function rpc_return_to_ai(p_conversation_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update whatsapp_conversations
    set attendance_mode = 'ia', assigned_user_id = null, updated_by = p_actor
    where id = p_conversation_id;
  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
    values ('whatsapp_conversations', p_conversation_id, 'status_change', jsonb_build_object('attendance_mode', 'ia'), p_actor);
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function rpc_return_to_ai(uuid, uuid) from public, anon;
grant  execute on function rpc_return_to_ai(uuid, uuid) to authenticated, service_role;
