-- =====================================================================
-- ROTA PIRAPEMAS — 40: BLOCO DE NOTAS GERAL
-- =====================================================================
-- O bloco de notas por-data (26-agenda-notes.sql) nasceu como rede de
-- segurança transitória pra colar a lista do Evernote durante a
-- migração. Virou um bloco de notas de verdade: notas soltas, sem data
-- obrigatória, criar/editar/fixar/apagar.
--
-- Migra o conteúdo das notas por-data existentes (texto real colado,
-- não vazio) pra notas individuais com a data no início do texto.
-- agenda_notes fica intacta (não é mais usada pelo app) até decisão do
-- dono de removê-la de vez — DROP TABLE é ação destrutiva e não roda
-- sozinho aqui.
--
-- Rodar depois de 01-39. Idempotente (menos a migração de dados, que só
-- insere o que ainda não existe com o mesmo conteúdo).
-- =====================================================================

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  content     text not null default '',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  updated_by  uuid references public.users(id)
);

alter table public.notes enable row level security;

-- Leitura: os mesmos papéis operacionais que liam agenda_notes.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select
  to authenticated
  using (fn_has_role(array['admin','atendente','motorista','financeiro']::user_role[]));

-- Escrita/apagar: admin + atendente.
drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert
  to authenticated
  with check (fn_has_role(array['admin','atendente']::user_role[]));

drop policy if exists notes_update on public.notes;
create policy notes_update on public.notes for update
  to authenticated
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete
  to authenticated
  using (fn_has_role(array['admin','atendente']::user_role[]));

-- Grants explícitos (o schema tem REVOKE DELETE global — 12-write-guards).
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.notes to service_role;

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at before update on public.notes
  for each row execute function fn_set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;

-- Migra o conteúdo das notas por-data existentes (só as com texto real).
insert into public.notes (content, created_at, updated_at, created_by, updated_by)
select
  to_char(a.note_date, 'DD/MM/YYYY') || E'\n\n' || a.content,
  a.created_at, a.updated_at, a.updated_by, a.updated_by
from public.agenda_notes a
where length(trim(a.content)) > 0
  and not exists (
    select 1 from public.notes n
    where n.content = to_char(a.note_date, 'DD/MM/YYYY') || E'\n\n' || a.content
  );

-- Pra apagar a tabela antiga depois que o dono confirmar (rodar à mão,
-- fora desta migração):
--   drop trigger if exists trg_agenda_notes_updated_at on public.agenda_notes;
--   drop table if exists public.agenda_notes;

-- Conferir:
--   select id, pinned, left(content, 40), updated_at from notes order by pinned desc, updated_at desc;
