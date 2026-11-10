-- =====================================================================
-- ROTA PIRAPEMAS — 76: RUAS DE PIRAPEMAS E CANTANHEDE (#274)
-- =====================================================================
-- Rodar depois de 01–75. Idempotente.
-- Ruas se repetem nas duas cidades (ex.: Lister Caldas): para atender sem erro o
-- bot precisa conhecer as cidades. Esta base começa com as ruas do OpenStreetMap
-- e APRENDE SOZINHA: toda reserva de Volta confirmada/embarcada (app, anotação,
-- bot, Claude) soma a rua citada à cidade do embarque. Se a equipe corrige a
-- cidade da reserva, o que ela tinha ensinado na cidade errada é desfeito.
-- Só serve de AVISO: a cidade da Volta continua vindo do que o cliente disse (#272).
-- =====================================================================

create table if not exists public.cidade_ruas (
  id           uuid primary key default gen_random_uuid(),
  cidade       text not null check (cidade in ('pirapemas', 'cantanhede')),
  nome         text not null,
  nucleo       text not null,
  fonte        text not null default 'reservas' check (fonte in ('mapa', 'reservas', 'equipe', 'dono')),
  ocorrencias  integer not null default 0,
  ultima_vez   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (cidade, nucleo)
);

create table if not exists public.cidade_ruas_vistas (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  rua_id         uuid not null references public.cidade_ruas(id) on delete cascade,
  primary key (reservation_id, rua_id)
);

drop trigger if exists trg_cidade_ruas_updated_at on public.cidade_ruas;
create trigger trg_cidade_ruas_updated_at
  before update on public.cidade_ruas
  for each row execute function fn_set_updated_at();

alter table public.cidade_ruas enable row level security;
alter table public.cidade_ruas_vistas enable row level security;

drop policy if exists cidade_ruas_select on public.cidade_ruas;
create policy cidade_ruas_select on public.cidade_ruas
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
drop policy if exists cidade_ruas_admin on public.cidade_ruas;
create policy cidade_ruas_admin on public.cidade_ruas
  for all using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));
grant select, insert, update, delete on public.cidade_ruas to authenticated;

-- ---------------------------------------------------------------------
-- Núcleo do nome: sem acento, sem "Rua/Av./Praça…" nem títulos ("Deputado"…).
-- "Rua Deputado Lister Caldas" e "Av. Lister Caldas" → "lister caldas".
-- ---------------------------------------------------------------------
create or replace function public.fn_nucleo_rua(p_nome text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    fn_normalizar_local(p_nome),
    '^((rua|r|avenida|av|travessa|tv|trav|praca|pca|estrada|estr|beco|rodovia|alameda|deputado|dep|desembargador|des|senador|sen|engenheiro|eng|doutor|dr|professor|prof|padre|pe|governador|gov|presidente|pres|coronel|cel|vereador|prefeito|dom|marechal|general|capitao|major|tenente) )+',
    ''))
$$;

-- Núcleo que vale sozinho, sem "Rua" na frente: duas palavras de 4+ letras
-- ("lister caldas", "benedito lopes"). "Nova", "da cruz", "sao jose" só com o prefixo.
create or replace function public.fn_nucleo_forte(p_nucleo text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_nucleo, '') ~ '[a-z]{4,} ([a-z]+ )*[a-z]{4,}'
$$;

-- Ruas citadas com prefixo num endereço livre: "Rua Lister caldas próx. ao bar" → "rua lister caldas".
create or replace function public.fn_ruas_do_texto(p_texto text)
returns setof text language plpgsql immutable set search_path = public as $$
declare
  seg text;
  p text[];
  acc text[];
  prefixos text[] := array['rua','r','avenida','av','travessa','tv','trav','praca','estrada','beco','rodovia','alameda'];
  paradas text[] := array['n','no','num','numero','casa','prox','proximo','proxima','perto','em','ao','a','atras','depois','antes',
    'esquina','junto','vizinho','vizinha','lado','frente','bairro','qd','quadra','lote','apto','ap','bloco','cep','centro',
    'entrada','saida','final','inicio','sn','onde','que','pra','para','na','nas','nos','com','sentido','ate'];
  i int; j int;
begin
  foreach seg in array regexp_split_to_array(
      translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '[,;:/()\n–—-]|\s(e|ou)\s') loop
    p := regexp_split_to_array(btrim(regexp_replace(seg, '[^a-z0-9]+', ' ', 'g')), ' ');
    for i in 1 .. coalesce(array_length(p, 1), 0) loop
      continue when not (p[i] = any(prefixos));
      acc := array[p[i]];
      for j in i + 1 .. least(i + 6, array_length(p, 1)) loop
        exit when p[j] ~ '^[0-9]' or p[j] = any(paradas) or p[j] = any(prefixos);
        acc := acc || p[j];
      end loop;
      if array_length(acc, 1) >= 2 then return next array_to_string(acc, ' '); end if;
    end loop;
  end loop;
end $$;

-- Núcleos citados num endereço: os com prefixo + os fortes já conhecidos citados sem prefixo.
create or replace function public.fn_nucleos_citados(p_texto text)
returns table (nucleo text, nome text) language sql stable set search_path = public as $$
  with com_prefixo as (
    select fn_nucleo_rua(x) nucleo, x nome from fn_ruas_do_texto(p_texto) x
  ), conhecidos as (
    select distinct r.nucleo, r.nucleo nome from cidade_ruas r
    where fn_nucleo_forte(r.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || r.nucleo || ' %')
  )
  select distinct on (t.nucleo) t.nucleo, t.nome from (
    select * from com_prefixo union all select * from conhecidos
  ) t
  where t.nucleo ~ '[a-z]{3,}' and t.nucleo !~ '^(da|de|do|das|dos)$'
  order by t.nucleo, length(t.nome) desc
$$;

-- Em que cidade(s) aparece cada rua citada (para os avisos do bot e do /agendar).
create or replace function public.fn_ruas_no_texto(p_texto text)
returns table (nucleo text, nome text, em_pirapemas boolean, em_cantanhede boolean,
               reservas_pirapemas integer, reservas_cantanhede integer)
language sql stable security definer set search_path = public as $$
  select c.nucleo,
         coalesce(max(r.nome) filter (where r.fonte <> 'reservas'), max(r.nome), c.nome),
         bool_or(r.cidade = 'pirapemas'), bool_or(r.cidade = 'cantanhede'),
         coalesce(sum(r.ocorrencias) filter (where r.cidade = 'pirapemas'), 0)::int,
         coalesce(sum(r.ocorrencias) filter (where r.cidade = 'cantanhede'), 0)::int
  from fn_nucleos_citados(p_texto) c
  join cidade_ruas r on r.nucleo = c.nucleo
  group by c.nucleo, c.nome
$$;
revoke all on function public.fn_ruas_no_texto(text) from public, anon;
grant execute on function public.fn_ruas_no_texto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Aprender com uma reserva (idempotente por reserva × rua)
-- ---------------------------------------------------------------------
create or replace function public.fn_aprender_ruas_da_reserva(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_cidade text;
  v_rua uuid;
  c record;
begin
  select res.*, t.direction, rp.code ponto into r
  from reservations res
  join trips t on t.id = res.trip_id
  left join route_points rp on rp.id = res.route_point_id
  where res.id = p_id;
  if not found then return; end if;
  v_cidade := case when r.ponto in ('pirapemas', 'cantanhede') and r.direction::text = 'volta' then r.ponto end;

  -- a cidade mudou (a equipe corrigiu)? desfaz o que foi ensinado na cidade errada
  with apagadas as (
    delete from cidade_ruas_vistas v using cidade_ruas cr
    where v.rua_id = cr.id and v.reservation_id = p_id and cr.cidade is distinct from v_cidade
    returning cr.id
  )
  update cidade_ruas set ocorrencias = greatest(ocorrencias - 1, 0) where id in (select id from apagadas);

  if r.deleted_at is not null or r.type::text <> 'passagem' or v_cidade is null
     or r.status::text not in ('confirmada', 'embarcado') then
    return;
  end if;

  for c in select * from fn_nucleos_citados(concat_ws(', ', r.pickup_detail, r.street, r.reference_point)) loop
    insert into cidade_ruas (cidade, nome, nucleo, fonte)
    values (v_cidade, initcap(c.nome), c.nucleo, 'reservas')
    on conflict (cidade, nucleo) do nothing;
    select id into v_rua from cidade_ruas where cidade = v_cidade and nucleo = c.nucleo;
    insert into cidade_ruas_vistas (reservation_id, rua_id) values (p_id, v_rua) on conflict do nothing;
    if found then
      update cidade_ruas set ocorrencias = ocorrencias + 1, ultima_vez = now() where id = v_rua;
    end if;
  end loop;
end $$;
revoke all on function public.fn_aprender_ruas_da_reserva(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_aprender_ruas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform fn_aprender_ruas_da_reserva(new.id);
  exception when others then
    raise warning 'aprender ruas (reserva %): %', new.id, sqlerrm; -- nunca derruba a reserva
  end;
  return new;
end $$;

drop trigger if exists trg_reservations_aprende_ruas on public.reservations;
create trigger trg_reservations_aprende_ruas
  after insert or update of status, route_point_id, trip_id, pickup_detail, street, reference_point, deleted_at
  on public.reservations
  for each row execute function fn_trg_aprender_ruas();

-- ---------------------------------------------------------------------
-- Semente: ruas com nome no OpenStreetMap (raio de 5 km do centro), 10/11/2026
-- ---------------------------------------------------------------------
insert into public.cidade_ruas (cidade, nome, nucleo, fonte)
select s.cidade, s.nome, fn_nucleo_rua(s.nome), 'mapa'
from (values
  ('pirapemas', 'Avenida Benedito Lopes'),
  ('pirapemas', 'Avenida Desembargador Joaquim Santos'),
  ('pirapemas', 'Avenida Engenheiro Celso Castelo Branco'),
  ('pirapemas', 'Avenida João Castelo'),
  ('pirapemas', 'Avenida Senador Vitorino Freire'),
  ('pirapemas', 'Avenida Viriato Correa'),
  ('pirapemas', 'Beco Joaquim Santos'),
  ('pirapemas', 'Beco da Mangueira'),
  ('pirapemas', 'Estrada Matoes'),
  ('pirapemas', 'Praça João Lisboa'),
  ('pirapemas', 'Praça Saturnino Belo'),
  ('pirapemas', 'Praça do Mercado'),
  ('pirapemas', 'Rua Cícero Nascimento'),
  ('pirapemas', 'Rua Deputado José Lamar'),
  ('pirapemas', 'Rua Deputado Lister Caldas'),
  ('pirapemas', 'Rua Deputado Newton Belo'),
  ('pirapemas', 'Rua Desembargador Joaquim Santos'),
  ('pirapemas', 'Rua Eurico Ribeiro'),
  ('pirapemas', 'Rua Floriano Peixoto'),
  ('pirapemas', 'Rua Luís Soares'),
  ('pirapemas', 'Rua Magno Bacelar'),
  ('pirapemas', 'Rua Moacir Andrade'),
  ('pirapemas', 'Rua Newton Bello'),
  ('pirapemas', 'Rua Nova'),
  ('pirapemas', 'Rua Paz Conceição'),
  ('pirapemas', 'Rua Santa Lúcia'),
  ('pirapemas', 'Rua Santa Maria'),
  ('pirapemas', 'Rua Santo Antônio'),
  ('pirapemas', 'Rua São Cristovão'),
  ('pirapemas', 'Rua São José'),
  ('pirapemas', 'Rua São Sebastião'),
  ('pirapemas', 'Rua Treze de Maio'),
  ('pirapemas', 'Rua Walter Andrade'),
  ('pirapemas', 'Rua Wilson Ribeiro'),
  ('pirapemas', 'Rua da Alegria'),
  ('pirapemas', 'Rua da Alegria 2'),
  ('pirapemas', 'Rua da Aurora'),
  ('pirapemas', 'Rua da Cajueiro'),
  ('pirapemas', 'Rua da Estrela'),
  ('pirapemas', 'Rua da Floresta'),
  ('pirapemas', 'Rua da Liberdade'),
  ('pirapemas', 'Rua da Monica'),
  ('pirapemas', 'Rua da Praça'),
  ('pirapemas', 'Rua da Praça 2'),
  ('pirapemas', 'Rua das Flores'),
  ('pirapemas', 'Rua das Flores 2'),
  ('pirapemas', 'Rua do Campo'),
  ('pirapemas', 'Rua do Centrinho Rua do Centrinho'),
  ('pirapemas', 'Rua do Sol'),
  ('pirapemas', 'Rua do Tucum'),
  ('pirapemas', 'Travessa Antônio Dino'),
  ('pirapemas', 'Travessa Antônio Ribeiro'),
  ('pirapemas', 'Travessa Ives Berredo'),
  ('pirapemas', 'Travessa Magno Bacelar'),
  ('pirapemas', 'Travessa São José'),
  ('pirapemas', 'Travessa Vitorino Freire'),
  ('pirapemas', 'Travessa da Estrela'),
  ('pirapemas', 'Travessa da Reciciagem'),
  ('pirapemas', 'Travessa dos Estivadores'),
  ('cantanhede', 'Avenida Benedito Lopes'),
  ('cantanhede', 'Avenida Castelo Branco'),
  ('cantanhede', 'Avenida Deputado Lister Caldas'),
  ('cantanhede', 'Avenida Nossa Senhora da Conceição'),
  ('cantanhede', 'Avenida Rio Branco'),
  ('cantanhede', 'Avenida São Patricio'),
  ('cantanhede', 'Estrada Cajui'),
  ('cantanhede', 'Estrada Cajui Esquerda'),
  ('cantanhede', 'Praça Paulo Rodrigues'),
  ('cantanhede', 'Praça da Cruz'),
  ('cantanhede', 'Rua 10 de Outubro'),
  ('cantanhede', 'Rua Benedito Lopes'),
  ('cantanhede', 'Rua Boa Esperanca'),
  ('cantanhede', 'Rua Gonçalves Dias'),
  ('cantanhede', 'Rua Helena Rocha'),
  ('cantanhede', 'Rua Isidora Lopes'),
  ('cantanhede', 'Rua Izidoria Lopes'),
  ('cantanhede', 'Rua José Rego'),
  ('cantanhede', 'Rua José Samey'),
  ('cantanhede', 'Rua José Silva Soares'),
  ('cantanhede', 'Rua Monte Castelo'),
  ('cantanhede', 'Rua Nova'),
  ('cantanhede', 'Rua Paulo Rodrigues'),
  ('cantanhede', 'Rua Primeiro de Maio'),
  ('cantanhede', 'Rua Rana Ageme'),
  ('cantanhede', 'Rua Ruth Gomes'),
  ('cantanhede', 'Rua Sales Barbosa'),
  ('cantanhede', 'Rua Santa Bárbara'),
  ('cantanhede', 'Rua São Raimundi'),
  ('cantanhede', 'Rua São Raimundo o'),
  ('cantanhede', 'Rua da Areia'),
  ('cantanhede', 'Rua da Cachoeira'),
  ('cantanhede', 'Rua da Caixa D Água'),
  ('cantanhede', 'Rua da Caixa Dagua'),
  ('cantanhede', 'Rua da Coheb'),
  ('cantanhede', 'Rua da Garagem'),
  ('cantanhede', 'Rua da Igreja'),
  ('cantanhede', 'Rua da Mangueira'),
  ('cantanhede', 'Rua da Paz'),
  ('cantanhede', 'Rua da Picarrera'),
  ('cantanhede', 'Rua da Prainha'),
  ('cantanhede', 'Rua das Acácias'),
  ('cantanhede', 'Rua das Borboletas'),
  ('cantanhede', 'Rua das Flores'),
  ('cantanhede', 'Rua das Garças'),
  ('cantanhede', 'Rua de Santana'),
  ('cantanhede', 'Rua do Açude'),
  ('cantanhede', 'Rua do Bacuri'),
  ('cantanhede', 'Rua do Cajueiro'),
  ('cantanhede', 'Rua do Campinho'),
  ('cantanhede', 'Rua do Campo'),
  ('cantanhede', 'Rua do Jambo'),
  ('cantanhede', 'Rua do Mutirão'),
  ('cantanhede', 'Rua do Parque'),
  ('cantanhede', 'Rua do Sol'),
  ('cantanhede', 'Rua dos Amores'),
  ('cantanhede', 'Rua dos Figos'),
  ('cantanhede', 'Travessa Bacuri'),
  ('cantanhede', 'Travessa Olavo Bilac'),
  ('cantanhede', 'Travessa Pereira Rego'),
  ('cantanhede', 'Travessa Primeiro de Maio'),
  ('cantanhede', 'Travessa São Raimundo'),
  ('cantanhede', 'Travessa da Caixa Dagua'),
  ('cantanhede', 'Travessa da Rua Igreja'),
  ('cantanhede', 'Travessa da Rua do Aeroporto'),
  ('cantanhede', 'Travessa da Urca'),
  ('cantanhede', 'Travessa das Borboletas'),
  ('cantanhede', 'Travessa do Aeroporto'),
  ('cantanhede', 'Travessa do Campinho'),
  ('cantanhede', 'Travessa do Campo do Jurandir'),
  ('cantanhede', 'Travessa dos Lopes')
) as s(cidade, nome)
where fn_nucleo_rua(s.nome) ~ '[a-z]{3,}'
on conflict (cidade, nucleo) do nothing;

-- aprende com todo o histórico de Voltas
do $$ begin
  perform fn_aprender_ruas_da_reserva(r.id)
  from reservations r join trips t on t.id = r.trip_id
  where t.direction = 'volta' and r.deleted_at is null;
end $$;
