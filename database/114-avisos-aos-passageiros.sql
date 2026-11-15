-- 114 — Avisos aos passageiros pelo WhatsApp (issue #432)
--
-- "Avisar passageiros" da Agenda: cada envio fica registrado — o que foi mandado, como (texto
-- livre dentro das 24 h ou modelo aprovado pela Meta) e o resultado. "fora_da_janela" e
-- "sem_conversa" não saíram: a equipe avisa pelo celular. Só a Edge Function avisar-passageiros
-- grava (service role); admin e atendente leem para ver quem já foi avisado.
-- O modelo da Meta fica em settings.aviso_modelo = {"nome": "...", "idioma": "pt_BR", "categoria": "UTILITY"}.

create table if not exists public.avisos_passageiros (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  customer_id    uuid references public.customers(id),
  trip_date      date not null,
  direction      trip_direction not null,
  texto          text not null,
  modo           text check (modo in ('texto', 'modelo')),
  status         text not null check (status in ('enviado', 'falhou', 'fora_da_janela', 'sem_conversa')),
  erro           text,
  enviado_por    uuid references public.users(id),
  criado_em      timestamptz not null default now()
);
create index if not exists idx_avisos_passageiros_viagem on public.avisos_passageiros (trip_date, direction);
create index if not exists idx_avisos_passageiros_reserva on public.avisos_passageiros (reservation_id);

alter table public.avisos_passageiros enable row level security;
drop policy if exists avisos_passageiros_equipe on public.avisos_passageiros;
create policy avisos_passageiros_equipe on public.avisos_passageiros
  for select using (coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false));

grant select on public.avisos_passageiros to authenticated;
