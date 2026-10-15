-- =====================================================================
-- ROTA PIRAPEMAS — 50: BASE DE CONHECIMENTO DO BOT DE WHATSAPP
-- =====================================================================
-- O bot responde em linguagem natural, mas só com o que está aqui + os
-- dados ao vivo do sistema (horários, vagas, preços). Cada linha é um
-- assunto (ex.: "Bagagem") com o que o bot deve saber/dizer sobre ele.
-- Guia de estilo e modo de atendimento ('ia' | 'manual' | 'sombra')
-- ficam em `settings` (chaves bot_style_guide e attendance_mode), sem
-- tabela nova.
--
-- Leitura: admin/atendente (a Edge Function usa service_role). Escrita:
-- só admin. Remoção é soft-delete (update deleted_at), nunca DELETE.
--
-- Rodar depois de 01-49. Idempotente.
-- =====================================================================

create table if not exists public.bot_knowledge (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  content     text not null check (length(btrim(content)) > 0),
  active      boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id),
  deleted_at  timestamptz
);

alter table public.bot_knowledge enable row level security;

drop policy if exists bot_knowledge_select on public.bot_knowledge;
create policy bot_knowledge_select on public.bot_knowledge
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

drop policy if exists bot_knowledge_insert on public.bot_knowledge;
create policy bot_knowledge_insert on public.bot_knowledge
  for insert with check (fn_has_role(array['admin']::user_role[]));

drop policy if exists bot_knowledge_update on public.bot_knowledge;
create policy bot_knowledge_update on public.bot_knowledge
  for update
  using (fn_has_role(array['admin']::user_role[]))
  with check (fn_has_role(array['admin']::user_role[]));

revoke all on public.bot_knowledge from anon;
grant select, insert, update on public.bot_knowledge to authenticated;

create or replace function public.fn_bot_knowledge_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_bot_knowledge_touch on public.bot_knowledge;
create trigger trg_bot_knowledge_touch
  before update on public.bot_knowledge
  for each row execute function public.fn_bot_knowledge_touch();
