-- =====================================================================
-- ROTA PIRAPEMAS — 32: PENDÊNCIAS DE ATENDIMENTO (fila da equipe)
-- =====================================================================
-- "Pendência" = um atendimento que precisa da equipe: o bot de WhatsApp
-- transferiu para humano, ou alguém abriu manualmente ("ligar de volta
-- para o cliente X"). Fica aberta até alguém resolver.
--
-- Toda pendência nova entra também no sino (app_notifications, kind
-- 'pendencia' — ver database/31).
--
-- NÃO depende do schema de WhatsApp (06) — quando o bot for publicado,
-- basta o transferToHuman chamar rpc_open_support_ticket.
--
-- Rodar depois de 01-31. Idempotente.
-- =====================================================================

-- 'pendencia' passa a ser um kind válido de app_notifications.
alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in (
    'lotacao', 'cancelamento', 'mudanca_embarque', 'mudanca_desembarque', 'pendencia'));

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'manual'
               check (source in ('manual', 'whatsapp', 'sistema')),
  phone        text,
  customer_id  uuid references public.customers(id) on delete set null,
  subject      text not null,
  detail       text not null default '',
  status       text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  resolved_at  timestamptz,
  resolved_by  uuid references public.users(id)
);
create index if not exists idx_support_tickets_abertas
  on public.support_tickets (created_at desc) where status = 'aberta';

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select
  to authenticated
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]));

grant select on public.support_tickets to authenticated, service_role;

-- View com nome do cliente / atendente resolvido.
create or replace view public.v_pendencias_atendimento
with (security_invoker = true) as
select
  t.id, t.source, t.phone, t.customer_id,
  coalesce(nullif(trim(t.subject), ''), 'Atendimento')      as assunto,
  t.detail, t.status, t.meta, t.created_at, t.resolved_at,
  cust.name  as cliente,
  ub.name    as aberto_por,
  ur.name    as resolvido_por
from public.support_tickets t
left join public.customers cust on cust.id = t.customer_id
left join public.users ub on ub.id = t.created_by
left join public.users ur on ur.id = t.resolved_by
where t.status = 'aberta'
order by t.created_at desc;

grant select on public.v_pendencias_atendimento to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Trigger: pendência aberta → notificação no sino.
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_pendencia() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nome text;
begin
  if NEW.status <> 'aberta' then
    return NEW;
  end if;
  select name into v_nome from customers where id = NEW.customer_id;
  v_nome := coalesce(nullif(trim(v_nome), ''), NEW.phone, 'cliente');
  perform fn_app_notify(
    'pendencia',
    format('Atendimento para a equipe — %s', v_nome),
    coalesce(nullif(trim(NEW.subject), ''), 'Nova pendência de atendimento.'),
    null, null, null,
    jsonb_build_object('ticket_id', NEW.id, 'phone', NEW.phone, 'source', NEW.source));
  return NEW;
end;
$$;
revoke execute on function public.fn_notify_pendencia() from public, anon, authenticated;

drop trigger if exists trg_notify_pendencia on public.support_tickets;
create trigger trg_notify_pendencia
  after insert on public.support_tickets
  for each row execute function public.fn_notify_pendencia();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.rpc_open_support_ticket(
  p_subject text, p_detail text default '', p_phone text default null,
  p_customer_id uuid default null, p_source text default 'manual', p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_subject is null or trim(p_subject) = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o assunto.');
  end if;
  insert into support_tickets (source, phone, customer_id, subject, detail, meta, created_by)
  values (coalesce(p_source, 'manual'), p_phone, p_customer_id, trim(p_subject),
          coalesce(p_detail, ''), coalesce(p_meta, '{}'::jsonb), v_actor)
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;
revoke execute on function public.rpc_open_support_ticket(text,text,text,uuid,text,jsonb) from public, anon;
grant  execute on function public.rpc_open_support_ticket(text,text,text,uuid,text,jsonb) to authenticated, service_role;

create or replace function public.rpc_resolve_support_ticket(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update support_tickets
    set status = 'resolvida', resolved_at = now(), resolved_by = v_actor
    where id = p_id and status = 'aberta';
  if not found then
    return jsonb_build_object('success', false, 'message', 'Pendência não encontrada ou já resolvida.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_resolve_support_ticket(uuid) from public, anon;
grant  execute on function public.rpc_resolve_support_ticket(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select public.rpc_open_support_ticket('Teste', 'ligar de volta', '5599...');
--   select id, assunto, cliente, source, created_at from v_pendencias_atendimento;
