-- =====================================================================
-- ROTA PIRAPEMAS — 75: MEMÓRIA DE ENDEREÇOS → BAIRRO (#270)
-- =====================================================================
-- Rodar depois de 01–74. Idempotente.
-- O cliente costuma dizer o condomínio/residencial ("Residencial Colinas") em
-- vez do bairro. A busca em casa é cobrada pelo bairro (neighborhood_pricing),
-- então o bot precisa saber em que bairro fica o lugar. Esta tabela guarda o
-- que já se sabe: o que a equipe confirmou na conversa, o que o dono cadastrou
-- e o que o bot descobriu pesquisando na internet (fonte 'internet', a conferir).
-- O bairro é sempre um da tabela de preços: nada aqui inventa preço.
-- =====================================================================

create table if not exists public.bairro_aliases (
  id          uuid primary key default gen_random_uuid(),
  apelido     text not null,
  bairro      text not null,
  fonte       text not null default 'internet' check (fonte in ('equipe', 'internet', 'dono')),
  confirmado  boolean not null default false,
  evidencia   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uq_bairro_aliases_apelido
  on public.bairro_aliases (fn_normalizar_local(apelido));

drop trigger if exists trg_bairro_aliases_updated_at on public.bairro_aliases;
create trigger trg_bairro_aliases_updated_at
  before update on public.bairro_aliases
  for each row execute function fn_set_updated_at();

alter table public.bairro_aliases enable row level security;

drop policy if exists bairro_aliases_select on public.bairro_aliases;
create policy bairro_aliases_select on public.bairro_aliases
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

drop policy if exists bairro_aliases_delete on public.bairro_aliases;
create policy bairro_aliases_delete on public.bairro_aliases
  for delete using (fn_has_role(array['admin']::user_role[]));

grant select, delete on public.bairro_aliases to authenticated;

-- 09/11: a equipe confirmou na conversa que o Residencial Colinas fica no Turu
insert into public.bairro_aliases (apelido, bairro, fonte, confirmado, evidencia)
values ('Residencial Colinas', 'Turu', 'equipe', true, 'Equipe perguntou "Turu certo?" e a cliente confirmou (09/11).')
on conflict (fn_normalizar_local(apelido)) do nothing;
