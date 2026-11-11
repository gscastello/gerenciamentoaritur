-- =====================================================================
-- ROTA PIRAPEMAS — 86: ASSISTENTE DA EQUIPE (#288)
-- =====================================================================
-- Rodar depois de 01–85. Idempotente.
-- A aba "Assistente" do app conversa com a IA pela chave da API (Edge Function
-- `assistente`). Aqui ficam o registro de uso de cada pedido (tokens e custo
-- estimado em dólar) e o teto de gasto do mês (settings.assistant_budget).
-- Só o servidor (service_role) grava o uso; admin lê.
-- =====================================================================

create table if not exists public.assistente_uso (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id),
  modelo        text not null,
  entrada       integer not null default 0,
  saida         integer not null default 0,
  cache_leitura integer not null default 0,
  cache_escrita integer not null default 0,
  custo_usd     numeric(10, 5) not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_assistente_uso_created on public.assistente_uso (created_at);
create index if not exists idx_assistente_uso_user on public.assistente_uso (user_id);

alter table public.assistente_uso enable row level security;
revoke all on public.assistente_uso from anon, public;
grant select on public.assistente_uso to authenticated;

drop policy if exists assistente_uso_select on public.assistente_uso;
create policy assistente_uso_select on public.assistente_uso
  for select to authenticated
  using ((select fn_has_role(array['admin']::user_role[])));

-- teto de gasto do mês (US$); o dono muda em Sistema
insert into public.settings (key, value)
values ('assistant_budget', '{"usd_mensal": 20}'::jsonb)
on conflict (key) do nothing;
