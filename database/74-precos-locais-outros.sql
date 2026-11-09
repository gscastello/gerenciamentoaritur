-- =====================================================================
-- ROTA PIRAPEMAS — 74: PREÇO PRÓPRIO DE LOCAIS EM "OUTROS" (#263)
-- =====================================================================
-- Rodar depois de 01–73. Idempotente.
-- Na Ida, "Outros" reúne qualquer embarque que não seja Buscar em Casa,
-- Rodoviária ou Retorno (database/73). Alguns desses locais têm preço próprio:
-- o embarque DENTRO do aeroporto custa R$ 70 (decisão do dono, 2026-11-09).
-- Aqui fica a tabela desses locais; o resto de Outros usa o preço do ponto.
--
-- Atenção, regra do dono: "retorno do aeroporto" é o ponto RETORNO, não o
-- aeroporto. Quem aplica o preço (bot e app) ignora texto que fala em
-- "retorno" (precoDoLocalDeOutros, com testes nos dois lados).
-- Mudar é só do admin (Sistema → Preços); ler é de admin/atendente.
-- =====================================================================

create table if not exists public.boarding_spot_prices (
  id          uuid primary key default gen_random_uuid(),
  local       text not null,
  price       numeric(10,2) not null check (price > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id)
);

create unique index if not exists uq_boarding_spot_prices_local
  on public.boarding_spot_prices (fn_normalizar_local(local));

drop trigger if exists trg_boarding_spot_prices_updated_at on public.boarding_spot_prices;
create trigger trg_boarding_spot_prices_updated_at
  before update on public.boarding_spot_prices
  for each row execute function fn_set_updated_at();

alter table public.boarding_spot_prices enable row level security;

drop policy if exists boarding_spot_prices_select on public.boarding_spot_prices;
create policy boarding_spot_prices_select on public.boarding_spot_prices
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

drop policy if exists boarding_spot_prices_delete on public.boarding_spot_prices;
create policy boarding_spot_prices_delete on public.boarding_spot_prices
  for delete using (fn_has_role(array['admin']::user_role[]));

grant select, delete on public.boarding_spot_prices to authenticated;

create or replace function public.rpc_upsert_boarding_spot_price(p_local text, p_price numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if length(btrim(coalesce(p_local, ''))) < 3 then
    return jsonb_build_object('success', false, 'message', 'Informe o local de embarque.');
  end if;
  if fn_normalizar_local(p_local) ~ '(^| )retorno( |$)' then
    return jsonb_build_object('success', false,
      'message', 'O Retorno é um ponto próprio, com o preço dele: não cadastre aqui.');
  end if;
  if p_price is null or p_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero.');
  end if;

  insert into boarding_spot_prices (local, price, created_by, updated_by)
  values (btrim(p_local), p_price, auth.uid(), auth.uid())
  on conflict (fn_normalizar_local(local)) do update
    set price = excluded.price, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

revoke all on function public.rpc_upsert_boarding_spot_price(text, numeric) from public, anon;
grant execute on function public.rpc_upsert_boarding_spot_price(text, numeric) to authenticated;

-- embarque dentro do aeroporto: R$ 70 (dono, 2026-11-09)
insert into public.boarding_spot_prices (local, price)
values ('Aeroporto', 70)
on conflict (fn_normalizar_local(local)) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boarding_spot_prices'
  ) then
    execute 'alter publication supabase_realtime add table public.boarding_spot_prices';
  end if;
end $$;
