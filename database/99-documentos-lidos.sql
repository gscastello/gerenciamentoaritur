-- =====================================================================
-- ROTA PIRAPEMAS — 99: NOTAS E RECIBOS LIDOS POR FOTO (#362, #369)
-- =====================================================================
-- Rodar depois de 01–98. Idempotente.
-- A equipe fotografa a nota (diesel, peça, oficina, pedágio…). A Edge Function
-- `ler-documento` guarda a foto no bucket privado `notas`, lê com a IA e grava
-- a leitura aqui. A pessoa confere e lança: despesa (financial_entries),
-- abastecimento (fuel_records) ou manutenção (maintenance) — esses dois já
-- geram a despesa sozinhos pelos gatilhos de sempre. A leitura fica ligada ao
-- que foi lançado, e a foto entra no fechamento do mês para o contador.
-- Nada é lançado sem a confirmação de uma pessoa.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('notas', 'notas', false)
on conflict (id) do nothing;

create table if not exists public.documentos_lidos (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null default 'despesa'
                       check (tipo in ('despesa', 'abastecimento', 'manutencao', 'comprovante', 'outro')),
  arquivo            text,                       -- caminho no bucket `notas`
  dados              jsonb not null default '{}'::jsonb, -- a leitura (valor, data, fornecedor…)
  status             text not null default 'lido'
                       check (status in ('lido', 'lancado', 'descartado')),
  financial_entry_id uuid references public.financial_entries(id),
  fuel_record_id     uuid references public.fuel_records(id),
  maintenance_id     uuid references public.maintenance(id),
  custo_usd          numeric(10, 5) not null default 0,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_documentos_lidos_criados on public.documentos_lidos (created_at desc);

drop trigger if exists trg_documentos_lidos_updated_at on public.documentos_lidos;
create trigger trg_documentos_lidos_updated_at
  before update on public.documentos_lidos
  for each row execute function public.fn_set_updated_at();

alter table public.documentos_lidos enable row level security;

-- quem lança despesa (admin, financeiro) vê todas; o motorista vê as que ele fotografou
drop policy if exists documentos_lidos_select on public.documentos_lidos;
create policy documentos_lidos_select on public.documentos_lidos for select to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])) or created_by = (select auth.uid()));

-- gravar a leitura é da Edge Function (service_role); a pessoa só marca o que fez com ela
drop policy if exists documentos_lidos_update on public.documentos_lidos;
create policy documentos_lidos_update on public.documentos_lidos for update to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])) or created_by = (select auth.uid()))
  with check ((select fn_has_role(array['admin', 'financeiro']::user_role[])) or created_by = (select auth.uid()));

grant select, update on public.documentos_lidos to authenticated;

-- as fotos: só leitura para admin/financeiro (link temporário); quem grava é a Edge Function
drop policy if exists notas_select on storage.objects;
create policy notas_select on storage.objects for select to authenticated
  using (bucket_id = 'notas' and (select fn_has_role(array['admin', 'financeiro']::user_role[])));
