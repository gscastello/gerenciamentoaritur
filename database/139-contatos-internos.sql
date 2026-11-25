-- =====================================================================
-- ROTA PIRAPEMAS — 139: contatos internos (taxistas, equipe e família) (#532)
-- =====================================================================
-- Rodar depois de 01–138. Idempotente.
-- Dono, 24/11/2026: o bot nunca responde a estes números. As conversas deles não são observadas, não viram
-- pendência nem aprendizado, e nenhuma mensagem automática sai para elas. O "Agendado ☑️" da equipe continua
-- lançando. Os números são cadastrados só no banco (o repositório é público).
-- =====================================================================

create table if not exists public.contatos_internos (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text not null,
  tipo text not null check (tipo in ('taxista', 'equipe', 'familia')),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists contatos_internos_phone_ativo on public.contatos_internos (phone) where deleted_at is null;

alter table public.contatos_internos enable row level security;
revoke all on public.contatos_internos from anon, authenticated;
grant select, insert, update on public.contatos_internos to authenticated;
grant select, insert, update on public.contatos_internos to service_role;

drop policy if exists contatos_internos_select on public.contatos_internos;
create policy contatos_internos_select on public.contatos_internos for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente']::user_role[])));
drop policy if exists contatos_internos_insert on public.contatos_internos;
create policy contatos_internos_insert on public.contatos_internos for insert to authenticated
  with check ((select fn_has_role(array['admin']::user_role[])));
drop policy if exists contatos_internos_update on public.contatos_internos;
create policy contatos_internos_update on public.contatos_internos for update to authenticated
  using ((select fn_has_role(array['admin']::user_role[])))
  with check ((select fn_has_role(array['admin']::user_role[])));

drop trigger if exists trg_somente_leitura on public.contatos_internos;
create trigger trg_somente_leitura before insert or update or delete on public.contatos_internos
  for each statement execute function public.fn_trava_somente_leitura();

create or replace function public.fn_contato_interno(p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from contatos_internos where deleted_at is null and phone = any (fn_variantes_telefone(p_phone)));
$$;
revoke all on function public.fn_contato_interno(text) from public, anon, authenticated;
grant execute on function public.fn_contato_interno(text) to service_role;

create or replace function public.fn_conversa_interna(p_chatwoot_conversation_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select fn_contato_interno(w.phone) from whatsapp_conversations w
                    where w.chatwoot_conversation_id = p_chatwoot_conversation_id and w.deleted_at is null limit 1), false);
$$;
revoke all on function public.fn_conversa_interna(bigint) from public, anon, authenticated;
grant execute on function public.fn_conversa_interna(bigint) to service_role;
