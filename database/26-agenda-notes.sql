-- =====================================================================
-- ROTA PIRAPEMAS — 26: BLOCO DE NOTAS DA AGENDA (transição do Evernote)
-- =====================================================================
-- Durante a migração do Evernote para o app, o dono precisa de um lugar
-- para COLAR a lista do dia (texto cru, do jeito que está anotado) e
-- tê-la salva, visível para a equipe e sincronizada em tempo real.
--
-- Isto NÃO é a Agenda estruturada — é um bloco de notas livre, uma nota
-- por data. Não parseia nada, não cria reservas. É rede de segurança.
--
-- Rodar depois de 01-25. Idempotente.
-- =====================================================================

create table if not exists public.agenda_notes (
  note_date   date primary key,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id)
);

alter table public.agenda_notes enable row level security;

-- Leitura: os mesmos papéis operacionais que enxergam a Agenda.
drop policy if exists agenda_notes_select on public.agenda_notes;
create policy agenda_notes_select on public.agenda_notes for select
  to authenticated
  using (fn_has_role(array['admin','atendente','motorista','financeiro']::user_role[]));

-- Escrita: admin + atendente (quem cuida das reservas).
drop policy if exists agenda_notes_insert on public.agenda_notes;
create policy agenda_notes_insert on public.agenda_notes for insert
  to authenticated
  with check (fn_has_role(array['admin','atendente']::user_role[]));

drop policy if exists agenda_notes_update on public.agenda_notes;
create policy agenda_notes_update on public.agenda_notes for update
  to authenticated
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

-- Sem policy de DELETE de propósito: uma nota nunca é apagada (mantém o
-- histórico da transição). Esvaziar o campo é permitido (update).

-- Grants explícitos (o schema tem REVOKE DELETE global — 12-write-guards).
grant select, insert, update on public.agenda_notes to authenticated;
grant select, insert, update on public.agenda_notes to service_role;

drop trigger if exists trg_agenda_notes_updated_at on public.agenda_notes;
create trigger trg_agenda_notes_updated_at before update on public.agenda_notes
  for each row execute function fn_set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.agenda_notes;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select note_date, length(content), updated_at from agenda_notes order by note_date desc;
