-- 136-correcoes-do-bot.sql — issue #516
--
-- Fila de correções para o Claude: o que a equipe explica ao Assistente ("o bot leu errado, o certo é…")
-- fica guardado aqui. O Assistente grava na hora; o Claude lê a fila em lote ("corrija os erros do bot"),
-- corrige o código e marca `corrigida` com o que foi feito. Não muda reserva nem ensina o bot sozinho.

create table if not exists public.bot_correcoes (
  id uuid primary key default gen_random_uuid(),
  o_que_errou text not null check (length(btrim(o_que_errou)) between 3 and 1500),
  o_certo text not null check (length(btrim(o_certo)) between 2 and 1500),
  area text not null default 'outro'
    check (area in ('leitura_agendado', 'resposta_ao_cliente', 'revisor', 'transcricao', 'assistente', 'app', 'outro')),
  telefone text,
  reserva_id uuid references public.reservations(id),
  pendencia_id uuid,
  trecho text,
  status text not null default 'aberta' check (status in ('aberta', 'corrigida', 'descartada')),
  nota_do_claude text,
  issue_numero integer,
  resolvida_em timestamptz,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bot_correcoes_abertas on public.bot_correcoes (created_at desc) where status = 'aberta';

alter table public.bot_correcoes enable row level security;
revoke all on public.bot_correcoes from anon, authenticated;
grant select, insert on public.bot_correcoes to authenticated;
grant update (status, updated_at) on public.bot_correcoes to authenticated;
grant select, insert, update on public.bot_correcoes to service_role;

drop policy if exists bot_correcoes_select on public.bot_correcoes;
create policy bot_correcoes_select on public.bot_correcoes for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente', 'financeiro']::user_role[])));
drop policy if exists bot_correcoes_insert on public.bot_correcoes;
create policy bot_correcoes_insert on public.bot_correcoes for insert to authenticated
  with check ((select fn_has_role(array['admin', 'atendente', 'financeiro']::user_role[]))
              and created_by = (select auth.uid()) and status = 'aberta');
-- a pessoa pode tirar da fila o que registrou por engano (o admin, qualquer uma); corrigir é do Claude
drop policy if exists bot_correcoes_descartar on public.bot_correcoes;
create policy bot_correcoes_descartar on public.bot_correcoes for update to authenticated
  using (status = 'aberta' and (created_by = (select auth.uid()) or (select fn_has_role(array['admin']::user_role[]))))
  with check (status = 'descartada');

drop trigger if exists trg_somente_leitura on public.bot_correcoes;
create trigger trg_somente_leitura before insert or update or delete on public.bot_correcoes
  for each statement execute function public.fn_trava_somente_leitura();
