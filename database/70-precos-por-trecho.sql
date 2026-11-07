-- =====================================================================
-- ROTA PIRAPEMAS — 70: VALOR POR EMBARQUE E DESEMBARQUE; PREÇOS QUE EVOLUEM (#239)
-- =====================================================================
-- Rodar depois de 01–69. Idempotente. Aplicar ANTES de publicar o app e o bot.
--   route_fares            preço oficial de um trecho entre dois lugares, nos dois
--                          sentidos (ex.: Pirapemas ⇄ Miranda). Edita em Sistema.
--   bot_price_suggestions  preços que o bot viu e propõe: ditos pelo atendente ou
--                          repetidos nas reservas da equipe. NÃO valem sozinhos: só
--                          entram na tabela quando o dono aprova. O bot não decide preço.
-- Encomenda nunca entra aqui (AGENTS.md §10).
-- =====================================================================

create table if not exists public.route_fares (
  id         uuid primary key default gen_random_uuid(),
  origem     text not null check (length(btrim(origem)) between 2 and 80),
  destino    text not null check (length(btrim(destino)) between 2 and 80),
  price      numeric(10, 2) not null check (price > 0),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_route_fares_trecho
  on public.route_fares (fn_normalizar_local(origem), fn_normalizar_local(destino));

alter table public.route_fares enable row level security;
drop policy if exists route_fares_select on public.route_fares;
create policy route_fares_select on public.route_fares
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
drop policy if exists route_fares_delete on public.route_fares;
create policy route_fares_delete on public.route_fares
  for delete using (fn_has_role(array['admin']::user_role[]));
revoke all on public.route_fares from anon, authenticated;
grant select, delete on public.route_fares to authenticated;

-- Os valores que o dono já confirmou como oficiais (lições aprovadas em 2026-11-07).
insert into public.route_fares (origem, destino, price) values
  ('Pirapemas', 'Miranda', 30),
  ('Vila Embratel', 'Matões do Norte', 70),
  ('Pirapemas', 'Jordoa', 80)
on conflict do nothing;

create or replace function public.rpc_upsert_route_fare(p_origem text, p_destino text, p_price numeric)
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
  if length(btrim(coalesce(p_origem, ''))) < 2 or length(btrim(coalesce(p_destino, ''))) < 2 then
    return jsonb_build_object('success', false, 'message', 'Informe de onde e para onde.');
  end if;
  if fn_normalizar_local(p_origem) = fn_normalizar_local(p_destino) then
    return jsonb_build_object('success', false, 'message', 'Origem e destino são o mesmo lugar.');
  end if;
  if p_price is null or p_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero.');
  end if;

  insert into route_fares (origem, destino, price, created_by, updated_by)
  values (btrim(p_origem), btrim(p_destino), p_price, auth.uid(), auth.uid())
  on conflict (fn_normalizar_local(origem), fn_normalizar_local(destino)) do update
    set price = excluded.price, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;
revoke execute on function public.rpc_upsert_route_fare(text, text, numeric) from public, anon;
grant  execute on function public.rpc_upsert_route_fare(text, text, numeric) to authenticated, service_role;

create table if not exists public.bot_price_suggestions (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('bairro', 'trecho')),
  origem         text not null check (length(btrim(origem)) between 2 and 80),
  destino        text check (destino is null or length(btrim(destino)) between 2 and 80),
  price          numeric(10, 2) not null check (price > 0),
  fonte          text not null check (fonte in ('atendente', 'reservas')),
  evidence_count integer not null default 1,
  status         text not null default 'proposta' check (status in ('proposta', 'aprovada', 'recusada')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.users(id),
  check ((tipo = 'trecho') = (destino is not null))
);
create unique index if not exists uq_bot_price_suggestions_aberta
  on public.bot_price_suggestions (tipo, fn_normalizar_local(origem), fn_normalizar_local(coalesce(destino, '')), price)
  where status = 'proposta';

alter table public.bot_price_suggestions enable row level security;
drop policy if exists bot_price_suggestions_select on public.bot_price_suggestions;
create policy bot_price_suggestions_select on public.bot_price_suggestions
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
revoke all on public.bot_price_suggestions from anon, authenticated;
grant select on public.bot_price_suggestions to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.route_fares;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.bot_price_suggestions;
exception when duplicate_object then null;
end $$;

-- O aprendizado registra o que viu. Não registra o que já está na tabela com esse
-- valor nem o que o dono já recusou. Devolve true quando há sugestão aberta depois disso.
create or replace function public.rpc_registrar_sugestao_de_preco(
  p_tipo text, p_origem text, p_destino text, p_price numeric, p_fonte text, p_vezes integer default 1
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_origem text := fn_normalizar_local(p_origem);
  v_destino text := fn_normalizar_local(p_destino);
begin
  if p_tipo = 'bairro' then
    if exists (select 1 from neighborhood_pricing
                where fn_normalizar_local(neighborhood::text) = v_origem and price = p_price) then
      return false;
    end if;
  elsif exists (select 1 from route_fares
                 where price = p_price
                   and ((fn_normalizar_local(origem) = v_origem and fn_normalizar_local(destino) = v_destino)
                     or (fn_normalizar_local(origem) = v_destino and fn_normalizar_local(destino) = v_origem))) then
    return false;
  end if;

  if exists (select 1 from bot_price_suggestions
              where status = 'recusada' and tipo = p_tipo and price = p_price
                and fn_normalizar_local(origem) = v_origem
                and fn_normalizar_local(coalesce(destino, '')) = v_destino) then
    return false;
  end if;

  update bot_price_suggestions
     set evidence_count = case when p_fonte = 'reservas' then greatest(evidence_count, p_vezes)
                               else evidence_count + 1 end,
         last_seen_at = now()
   where status = 'proposta' and tipo = p_tipo and price = p_price
     and fn_normalizar_local(origem) = v_origem
     and fn_normalizar_local(coalesce(destino, '')) = v_destino;
  if found then
    return true;
  end if;

  insert into bot_price_suggestions (tipo, origem, destino, price, fonte, evidence_count)
  values (p_tipo, btrim(p_origem), nullif(btrim(p_destino), ''), p_price, p_fonte, greatest(p_vezes, 1));
  return true;
end;
$$;
revoke execute on function public.rpc_registrar_sugestao_de_preco(text, text, text, numeric, text, integer) from public, anon, authenticated;
grant  execute on function public.rpc_registrar_sugestao_de_preco(text, text, text, numeric, text, integer) to service_role;

-- Bairros que a equipe usa e a tabela não tem: mesmo nome, 2 vezes ou mais, sempre o
-- mesmo valor. Variação de bairro conhecido ("Cohatrac Condomínio X") fica de fora.
create or replace function public.fn_sugerir_bairros_das_reservas()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_linha record;
  v_n integer := 0;
begin
  for v_linha in
    select min(btrim(r.pickup_neighborhood)) as bairro, min(r.unit_price) as valor, count(*)::integer as vezes
      from reservations r
      join route_points rp on rp.id = r.route_point_id
     where r.deleted_at is null
       and r.type = 'passagem'
       and r.status <> 'cancelada'
       and r.whatsapp_source_message_id is null
       and rp.code = 'busca'
       and r.created_at > now() - interval '180 days'
       and length(btrim(coalesce(r.pickup_neighborhood, ''))) between 3 and 40
     group by fn_normalizar_local(r.pickup_neighborhood)
    having count(*) >= 2 and min(r.unit_price) = max(r.unit_price) and min(r.unit_price) > 0
  loop
    continue when exists (
      select 1 from neighborhood_pricing np
       where ' ' || fn_normalizar_local(v_linha.bairro) || ' ' like '% ' || fn_normalizar_local(np.neighborhood::text) || ' %'
          or ' ' || fn_normalizar_local(np.neighborhood::text) || ' ' like '% ' || fn_normalizar_local(v_linha.bairro) || ' %'
    );
    if rpc_registrar_sugestao_de_preco('bairro', v_linha.bairro, null, v_linha.valor, 'reservas', v_linha.vezes) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.fn_sugerir_bairros_das_reservas() from public, anon, authenticated;
grant  execute on function public.fn_sugerir_bairros_das_reservas() to service_role;

-- O dono decide. Aprovar grava na tabela de preços (e pode corrigir o valor antes).
create or replace function public.rpc_revisar_sugestao_de_preco(
  p_id uuid, p_aprovar boolean, p_price numeric default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_s bot_price_suggestions%rowtype;
  v_price numeric;
  v_id uuid;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  select * into v_s from bot_price_suggestions where id = p_id and status = 'proposta' for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Sugestão já revisada.');
  end if;

  if not p_aprovar then
    update bot_price_suggestions
       set status = 'recusada', reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_id;
    return jsonb_build_object('success', true, 'status', 'recusada');
  end if;

  v_price := coalesce(p_price, v_s.price);
  if v_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero.');
  end if;

  if v_s.tipo = 'bairro' then
    insert into neighborhood_pricing (neighborhood, price, created_by, updated_by)
    values (v_s.origem, v_price, auth.uid(), auth.uid())
    on conflict (neighborhood) do update set price = excluded.price, updated_by = auth.uid()
    returning id into v_id;
  else
    insert into route_fares (origem, destino, price, created_by, updated_by)
    values (v_s.origem, v_s.destino, v_price, auth.uid(), auth.uid())
    on conflict (fn_normalizar_local(origem), fn_normalizar_local(destino)) do update
      set price = excluded.price, updated_by = auth.uid(), updated_at = now()
    returning id into v_id;
  end if;

  update bot_price_suggestions
     set status = case when id = p_id then 'aprovada' else 'recusada' end,
         price = case when id = p_id then v_price else price end,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id
      or (status = 'proposta' and tipo = v_s.tipo
          and fn_normalizar_local(origem) = fn_normalizar_local(v_s.origem)
          and fn_normalizar_local(coalesce(destino, '')) = fn_normalizar_local(coalesce(v_s.destino, '')));

  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
  values (case when v_s.tipo = 'bairro' then 'neighborhood_pricing' else 'route_fares' end,
          v_id, 'update'::audit_action,
          jsonb_build_object('origem', v_s.origem, 'destino', v_s.destino, 'price', v_price, 'via', 'sugestao_do_bot'),
          auth.uid());
  return jsonb_build_object('success', true, 'status', 'aprovada', 'id', v_id);
end;
$$;
revoke execute on function public.rpc_revisar_sugestao_de_preco(uuid, boolean, numeric) from public, anon;
grant  execute on function public.rpc_revisar_sugestao_de_preco(uuid, boolean, numeric) to authenticated, service_role;

-- Conferir:
--   select origem, destino, price from route_fares order by 1, 2;
--   select public.fn_sugerir_bairros_das_reservas();
--   select tipo, origem, destino, price, fonte, evidence_count, status from bot_price_suggestions;
