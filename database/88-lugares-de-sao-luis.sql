-- =====================================================================
-- ROTA PIRAPEMAS — 88: LUGARES DE SÃO LUÍS → BAIRRO (#297)
-- =====================================================================
-- Rodar depois de 01–87. Idempotente.
-- A busca em casa é cobrada pelo bairro, mas o cliente cita o condomínio, a rua
-- ou uma referência ("Condomínio Jardim di Napoli, Estrada da Maioba"). Como já
-- existe para Pirapemas e Cantanhede (cidade_lugares, issue #274), aqui fica a
-- memória de São Luís: cada lugar citado no embarque de uma busca em casa
-- confirmada aponta para o bairro dela. Aprende sozinha com as reservas, começa
-- com o histórico e com a memória de endereços (bairro_aliases).
-- Só AJUDA a reconhecer o bairro: o preço continua sendo o da tabela do bairro.
-- =====================================================================

create table if not exists public.sao_luis_lugares (
  id          uuid primary key default gen_random_uuid(),
  nucleo      text not null,                 -- fn_pedacos_do_endereco: "condominio jardim di napoli", "da maioba"
  nome        text not null,
  tipo        text not null default 'referencia',
  bairro      text not null,                 -- nome do bairro na tabela de preços
  fonte       text not null default 'reservas' check (fonte in ('reservas', 'equipe', 'internet')),
  ocorrencias integer not null default 0,
  confirmado  boolean not null default false,
  ultima_vez  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (nucleo, bairro)
);
create index if not exists idx_sao_luis_lugares_nucleo on public.sao_luis_lugares (nucleo);

create table if not exists public.sao_luis_lugares_vistas (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  lugar_id       uuid not null references public.sao_luis_lugares(id) on delete cascade,
  primary key (reservation_id, lugar_id)
);
create index if not exists idx_sao_luis_lugares_vistas_lugar on public.sao_luis_lugares_vistas (lugar_id);

alter table public.sao_luis_lugares enable row level security;
alter table public.sao_luis_lugares_vistas enable row level security;
revoke all on public.sao_luis_lugares, public.sao_luis_lugares_vistas from anon, public;
grant select on public.sao_luis_lugares to authenticated;
drop policy if exists sao_luis_lugares_select on public.sao_luis_lugares;
create policy sao_luis_lugares_select on public.sao_luis_lugares
  for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente']::user_role[])));

-- pedaços que não dizem onde fica (bloco, quadra, casa, número…)
create or replace function public.fn_pedaco_util_sao_luis(p_nucleo text)
returns boolean language sql immutable set search_path = public as $$
  select length(coalesce(p_nucleo, '')) >= 4
     and p_nucleo !~ '^\d'
     and p_nucleo !~ '^(quadra|qd|bloco|bl|apartamento|apto|ap|casa|cs|lote|lt|numero|n|km|perto|proximo|frente|lado|esquina|fundo|fundos)( |$)'
$$;

-- o que uma reserva ensina: lugares do embarque → bairro (busca em casa confirmada)
create or replace function public.fn_aprender_sao_luis_da_reserva(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_bairro text;
  v_lugar uuid;
  c record;
begin
  select res.*, t.direction, rp.code ponto into r
  from reservations res
  join trips t on t.id = res.trip_id
  left join route_points rp on rp.id = res.route_point_id
  where res.id = p_id;
  if not found then return; end if;

  select np.neighborhood::text into v_bairro
  from neighborhood_pricing np
  where fn_normalizar_local(np.neighborhood::text) = fn_normalizar_local(r.pickup_neighborhood)
  limit 1;

  -- o que esta reserva tinha ensinado e não vale mais (cancelou, mudou o bairro…)
  with apagadas as (
    delete from sao_luis_lugares_vistas v using sao_luis_lugares l
    where v.lugar_id = l.id and v.reservation_id = p_id
      and (l.bairro is distinct from v_bairro or r.deleted_at is not null
           or r.status::text not in ('confirmada', 'embarcado') or r.ponto is distinct from 'busca')
    returning l.id
  )
  update sao_luis_lugares set ocorrencias = greatest(ocorrencias - 1, 0) where id in (select id from apagadas);

  if r.deleted_at is not null or r.type::text <> 'passagem' or r.ponto is distinct from 'busca'
     or r.direction::text <> 'ida' or v_bairro is null or r.status::text not in ('confirmada', 'embarcado') then
    return;
  end if;

  for c in
    select distinct on (p.nucleo) p.tipo, p.nucleo
    from fn_pedacos_do_endereco(concat_ws(', ', r.pickup_detail, r.street, r.reference_point)) p
    where fn_pedaco_util_sao_luis(p.nucleo)
  loop
    insert into sao_luis_lugares (nucleo, nome, tipo, bairro, fonte)
    values (c.nucleo, fn_nome_do_lugar(c.nucleo, c.tipo), c.tipo, v_bairro, 'reservas')
    on conflict (nucleo, bairro) do nothing;
    select id into v_lugar from sao_luis_lugares where nucleo = c.nucleo and bairro = v_bairro;
    insert into sao_luis_lugares_vistas (reservation_id, lugar_id) values (p_id, v_lugar) on conflict do nothing;
    if found then
      update sao_luis_lugares set ocorrencias = ocorrencias + 1, ultima_vez = now(), updated_at = now() where id = v_lugar;
    end if;
  end loop;
end $$;
revoke all on function public.fn_aprender_sao_luis_da_reserva(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_aprender_sao_luis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform fn_aprender_sao_luis_da_reserva(new.id);
  exception when others then
    raise warning 'aprender São Luís (reserva %): %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_reservations_aprende_sao_luis on public.reservations;
create trigger trg_reservations_aprende_sao_luis
  after insert or update of status, route_point_id, trip_id, pickup_detail, pickup_neighborhood, street, reference_point, deleted_at
  on public.reservations for each row execute function public.fn_trg_aprender_sao_luis();

-- Em que bairro fica o que foi escrito? Candidatos com a evidência (para o bot e o assistente).
create or replace function public.fn_bairro_pelo_endereco(p_texto text)
returns table (bairro text, lugar text, tipo text, ocorrencias integer, confirmado boolean, fonte text)
language sql stable security definer set search_path = public as $$
  with pedacos as (
    select distinct p.nucleo from fn_pedacos_do_endereco(p_texto) p where fn_pedaco_util_sao_luis(p.nucleo)
  )
  select l.bairro, l.nome, l.tipo, l.ocorrencias, l.confirmado, l.fonte
  from sao_luis_lugares l
  join pedacos p on p.nucleo = l.nucleo
     or (length(l.nucleo) >= 8 and coalesce(fn_distancia_grafia(p.nucleo, l.nucleo), 99) <= 1)
  where l.ocorrencias > 0 or l.confirmado
  order by l.confirmado desc, l.ocorrencias desc
$$;
revoke all on function public.fn_bairro_pelo_endereco(text) from public, anon;
grant execute on function public.fn_bairro_pelo_endereco(text) to authenticated;

-- começa com a memória de endereços (equipe/dono = confirmado; internet = a conferir)
insert into sao_luis_lugares (nucleo, nome, tipo, bairro, fonte, ocorrencias, confirmado)
select distinct on (p.nucleo, a.bairro) p.nucleo, a.apelido, 'referencia', a.bairro,
       case when a.fonte = 'internet' then 'internet' else 'equipe' end, 1, coalesce(a.confirmado, false)
from bairro_aliases a
cross join lateral fn_pedacos_do_endereco(a.apelido) p
where fn_pedaco_util_sao_luis(p.nucleo)
  and exists (select 1 from neighborhood_pricing np where fn_normalizar_local(np.neighborhood::text) = fn_normalizar_local(a.bairro))
on conflict (nucleo, bairro) do nothing;

-- e com o histórico de buscas em casa confirmadas
do $$
declare v_id uuid;
begin
  for v_id in
    select r.id from reservations r join route_points rp on rp.id = r.route_point_id
    where rp.code = 'busca' and r.deleted_at is null and r.status in ('confirmada', 'embarcado') and r.pickup_neighborhood is not null
  loop
    perform fn_aprender_sao_luis_da_reserva(v_id);
  end loop;
end $$;
