-- =====================================================================
-- ROTA PIRAPEMAS — 77: LUGARES DE PIRAPEMAS E CANTANHEDE (#274)
-- =====================================================================
-- Rodar depois de 01–76. Idempotente.
-- Amplia a base de ruas (76) para TODOS os lugares que o cliente usa para
-- dizer onde embarca: ruas (com ou sem "Rua"), pontos de referência (bar,
-- padaria, hospital, posto, auto escola…), bairros/localidades ("Marajá",
-- "Provisória"), povoados e "casa de fulano". Cada endereço de reserva é
-- quebrado em pedaços ("Lister caldas ao lado choperia do riba" → rua "lister
-- caldas" + referência "choperia do riba"); cada pedaço vira um lugar da cidade
-- e os lugares citados juntos ficam CRUZADOS (a choperia do Riba fica na Lister
-- Caldas, em Pirapemas). Aprende sozinha com toda reserva de Volta
-- confirmada/embarcada; corrigir a cidade desfaz o que a reserva ensinou.
-- Só serve de AVISO: a cidade da Volta continua vindo do cliente (#272).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. cidade_ruas → cidade_lugares (+ tipo)
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('public.cidade_ruas') is not null and to_regclass('public.cidade_lugares') is null then
    alter table public.cidade_ruas rename to cidade_lugares;
  end if;
  if to_regclass('public.cidade_ruas_vistas') is not null and to_regclass('public.cidade_lugares_vistas') is null then
    alter table public.cidade_ruas_vistas rename to cidade_lugares_vistas;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'cidade_lugares_vistas' and column_name = 'rua_id') then
    alter table public.cidade_lugares_vistas rename column rua_id to lugar_id;
  end if;
end $$;

create table if not exists public.cidade_lugares (
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
create table if not exists public.cidade_lugares_vistas (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  lugar_id       uuid not null references public.cidade_lugares(id) on delete cascade,
  primary key (reservation_id, lugar_id)
);
create index if not exists idx_cidade_lugares_vistas_lugar on public.cidade_lugares_vistas (lugar_id);

alter table public.cidade_lugares add column if not exists tipo text not null default 'rua';
alter table public.cidade_lugares drop constraint if exists cidade_lugares_tipo_check;
alter table public.cidade_lugares add constraint cidade_lugares_tipo_check
  check (tipo in ('rua', 'referencia', 'casa', 'povoado'));

alter table public.cidade_lugares enable row level security;
alter table public.cidade_lugares_vistas enable row level security;
drop policy if exists cidade_ruas_select on public.cidade_lugares;
drop policy if exists cidade_ruas_admin on public.cidade_lugares;
drop policy if exists cidade_lugares_select on public.cidade_lugares;
create policy cidade_lugares_select on public.cidade_lugares
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
drop policy if exists cidade_lugares_admin on public.cidade_lugares;
create policy cidade_lugares_admin on public.cidade_lugares
  for all using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));
grant select, insert, update, delete on public.cidade_lugares to authenticated;

-- as funções da 76 apontavam para a tabela antiga
drop trigger if exists trg_reservations_aprende_ruas on public.reservations;
drop function if exists public.fn_trg_aprender_ruas();
drop function if exists public.fn_aprender_ruas_da_reserva(uuid);
drop function if exists public.fn_ruas_no_texto(text);
drop function if exists public.fn_nucleos_citados(text);
drop function if exists public.fn_ruas_do_texto(text);

-- ---------------------------------------------------------------------
-- 2. Quebrar um endereço livre em lugares
-- ---------------------------------------------------------------------
-- Palavras que começam um ponto de referência (cortam o nome da rua antes delas).
create or replace function public.fn_palavras_de_lugar()
returns text[] language sql immutable as $$
  select array['bar','choperia','comercial','comercio','casa','igreja','posto','mercado','mercadinho','supermercado',
    'escola','colegio','creche','padaria','farmacia','farma','drogaria','oficina','lava','restaurante','hotel','pousada',
    'deposito','salao','ubs','quadra','campo','loja','lanches','lanchonete','churrasquinho','churrascaria','distribuidora',
    'clinica','hospital','delegacia','forum','prefeitura','camara','banco','ginasio','cemiterio','feira','academia',
    'borracharia','barbearia','sorveteria','sitio','fazenda','fazendinha','assembleia','cras','caema','auto','autoescola',
    'funeraria','boteco','agrovet','material','torre','predio','mae','vo','seu','dona','loteria','loterica','correios',
    'cartorio','sindicato','estacao','rodoviaria','pracinha','varanda','disk','ferro','marcenaria','serraria','vidracaria']
$$;

create or replace function public.fn_pedacos_do_endereco(p_texto text)
returns table (tipo text, nucleo text) language plpgsql stable set search_path = public as $$
declare
  t text;
  seg text;
  fila text[];
  w text[];
  n int;
  k int;
  rua text;
  achado text;
  prefixos text[] := array['rua','r','avenida','av','travessa','trav','tv','praca','estrada','beco','rodovia','alameda'];
  artigos text[] := array['o','a','os','as','ao','aos','da','do','das','dos','de','na','no','nas','nos','em','com','ate','pela','pelo','lado'];
  pessoa text[] := array['casa','mae','vo','seu','dona'];
  lugar text[] := fn_palavras_de_lugar();
begin
  t := translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  t := regexp_replace(t, '\+ ?55', ' ', 'g');
  t := replace(t, '.', ' ');
  -- conectores ("próx", "ao lado", "em frente"…) separam um lugar do outro
  t := regexp_replace(t, '\m(proximo|proxima|prox|perto|ao lado|do lado|em frente|frente|defronte|atras|depois|apos|antes|esquina com|esquina|vizinho|vizinha|junto|em cima|embaixo|entre|e)\M', '|', 'g');
  -- "final da rua", "última casa", "casa 3": descrição, não lugar
  t := regexp_replace(t, '\m(final|fim|inicio|comeco|meio) d[ao] rua\M|\multim[ao] casa\M', '|', 'g');
  -- "pra Miranda" / "para Matões" é para onde vai, não onde embarca
  t := regexp_replace(t, '\m(pra|para)\M[^|,;]*', '|', 'g');
  -- "João Castelo casa da Dourinha": a casa de alguém é outro lugar
  t := regexp_replace(t, '([a-z0-9]) (casa d|mae d|vo d|seu |dona )', '\1|\2', 'g');

  fila := regexp_split_to_array(t, '[|,;:/()\n–—-]');
  while coalesce(array_length(fila, 1), 0) > 0 loop
    seg := fila[1];
    fila := fila[2:];
    w := regexp_split_to_array(btrim(regexp_replace(seg, '[^a-z0-9]+', ' ', 'g')), ' ');
    -- tira artigos do começo e corta no primeiro número ("casa 74", "n 18");
    -- "10 de outubro", "13 de maio" são nomes de rua, não número de casa
    while coalesce(array_length(w, 1), 0) > 0 and (w[1] = any(artigos) or w[1] = '') loop w := w[2:]; end loop;
    n := 0;
    for k in 1 .. coalesce(array_length(w, 1), 0) loop
      exit when w[k] ~ '^[0-9]' and coalesce(w[k + 1], '') <> 'de';
      n := k;
    end loop;
    w := w[1:n];
    while coalesce(array_length(w, 1), 0) > 0 and w[array_length(w, 1)] = any(array['n','no','num','numero','casa','sn','qd','lote','apto','ap']) loop
      w := w[1:array_length(w, 1) - 1];
    end loop;
    continue when coalesce(array_length(w, 1), 0) = 0;
    seg := array_to_string(w, ' ');

    -- rua com prefixo: vai até a primeira palavra de lugar ("rua do cajueiro bar nascer do sol")
    if w[1] = any(prefixos) and array_length(w, 1) >= 2 then
      n := array_length(w, 1);
      for k in 2 .. array_length(w, 1) loop
        -- "rua do campo" é rua; "rua do cajueiro bar…" corta no bar (já tem nome antes)
        if w[k] = any(lugar) and k > 2
           and exists (select 1 from unnest(w[2:k - 1]) x where length(x) >= 3 and not (x = any(artigos))) then
          n := k - 1; exit;
        end if;
      end loop;
      tipo := 'rua'; nucleo := fn_nucleo_rua(array_to_string(w[1:n], ' '));
      if nucleo ~ '[a-z]{3,}' and nucleo !~ '^(da|de|do|das|dos)$' then return next; end if;
      if n < array_length(w, 1) then fila := array_prepend(array_to_string(w[n + 1:], ' '), fila); end if;
      continue;
    end if;

    -- rua conhecida citada sem "Rua" ("Isidora Lopes próx creche", "lister caldas rose bronze")
    select l.nucleo into achado from cidade_lugares l
    where l.tipo = 'rua' and fn_nucleo_forte(l.nucleo) and (seg || ' ') like (l.nucleo || ' %')
    order by length(l.nucleo) desc limit 1;
    if achado is not null then
      tipo := 'rua'; nucleo := achado; return next;
      seg := btrim(substr(seg, length(achado) + 1));
      if seg <> '' then fila := array_prepend(seg, fila); end if;
      continue;
    end if;

    -- rua conhecida pelo nome exato ("dr luis", "boa esperanca") ou com data ("10 de outubro")
    if seg ~ '^[0-9]+ de [a-z]+$' or exists (select 1 from cidade_lugares l where l.tipo = 'rua' and l.nucleo = seg) then
      tipo := 'rua'; nucleo := seg; return next;
      continue;
    end if;

    -- casa de alguém / pessoa ("casa do Erasmo", "mãe do Jackson", "seu Geraldo")
    tipo := case when w[1] = any(pessoa) and array_length(w, 1) >= 2 then 'casa' else 'referencia' end;
    nucleo := array_to_string(w[1:least(array_length(w, 1), 5)], ' ');
    -- nada genérico: "casa amarela", "final da rua", "entrada", "última casa"…
    continue when nucleo !~ '[a-z]{3,}'
      or nucleo ~ '^(casa|portao|predio|muro)( (de|da|do))? ?(amarel|azul|verde|branc|cinz|rosa|vermelh|pret|laranj|bege|roxo|marrom)'
      or nucleo ~ '^(final|ultima|ultimo|entrada|saida|inicio|meio)( |$)'
      or nucleo in ('casa', 'rua', 'bairro', 'encomenda', 'sozinho', 'sozinha', 'miranda', 'sao luis', 'quebra mola', 'mesmo lugar', 'mesmo local', 'aqui');
    return next;
  end loop;
end $$;

-- Nome para mostrar de um lugar aprendido: "do cajueiro" (rua) → "Rua do Cajueiro".
create or replace function public.fn_nome_do_lugar(p_nucleo text, p_tipo text)
returns text language sql immutable set search_path = public as $$
  select case when p_tipo = 'rua' and p_nucleo ~ '^(da|de|do|das|dos) ' then 'Rua ' else '' end
    || btrim(replace(replace(replace(replace(replace(replace(' ' || initcap(p_nucleo) || ' ',
         ' Da ', ' da '), ' De ', ' de '), ' Do ', ' do '), ' Das ', ' das '), ' Dos ', ' dos '), ' E ', ' e '))
$$;

-- Lugares citados num texto: os pedaços + lugares fortes já conhecidos citados no meio do texto.
create or replace function public.fn_lugares_citados(p_texto text)
returns table (tipo text, nucleo text) language sql stable set search_path = public as $$
  select distinct on (t.nucleo) t.tipo, t.nucleo from (
    select p.tipo, p.nucleo from fn_pedacos_do_endereco(p_texto) p
    union all
    select l.tipo, l.nucleo from cidade_lugares l
    where fn_nucleo_forte(l.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || l.nucleo || ' %')
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc
$$;

-- ---------------------------------------------------------------------
-- 3. Consulta: em que cidade(s) aparece cada lugar citado e com o que ele anda junto
-- ---------------------------------------------------------------------
create or replace function public.fn_lugares_no_texto(p_texto text)
returns table (tipo text, nucleo text, nome text, em_pirapemas boolean, em_cantanhede boolean,
               reservas_pirapemas integer, reservas_cantanhede integer,
               junto_pirapemas text, junto_cantanhede text)
language sql stable security definer set search_path = public as $$
  with citados as (select * from fn_lugares_citados(p_texto)),
  base as (
    select l.* from cidade_lugares l where l.nucleo in (select c.nucleo from citados c)
  ),
  junto as (
    -- o lugar que mais aparece na mesma reserva (rua primeiro), por cidade
    select distinct on (b.id) b.id, l2.nome
    from base b
    join cidade_lugares_vistas v1 on v1.lugar_id = b.id
    join cidade_lugares_vistas v2 on v2.reservation_id = v1.reservation_id and v2.lugar_id <> v1.lugar_id
    join cidade_lugares l2 on l2.id = v2.lugar_id and l2.nucleo not in (select nucleo from citados)
    group by b.id, l2.nome, l2.tipo
    order by b.id, (l2.tipo = 'rua') desc, count(*) desc
  )
  select coalesce(max(b.tipo) filter (where b.tipo = 'rua'), max(b.tipo)),
         b.nucleo,
         coalesce(max(b.nome) filter (where b.fonte <> 'reservas'), max(b.nome)),
         bool_or(b.cidade = 'pirapemas'), bool_or(b.cidade = 'cantanhede'),
         coalesce(sum(b.ocorrencias) filter (where b.cidade = 'pirapemas'), 0)::int,
         coalesce(sum(b.ocorrencias) filter (where b.cidade = 'cantanhede'), 0)::int,
         max(j.nome) filter (where b.cidade = 'pirapemas'),
         max(j.nome) filter (where b.cidade = 'cantanhede')
  from base b left join junto j on j.id = b.id
  group by b.nucleo
$$;
revoke all on function public.fn_lugares_no_texto(text) from public, anon;
grant execute on function public.fn_lugares_no_texto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Aprender com uma reserva (idempotente por reserva × lugar)
-- ---------------------------------------------------------------------
create or replace function public.fn_aprender_lugares_da_reserva(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_cidade text;
  v_lugar uuid;
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
    delete from cidade_lugares_vistas v using cidade_lugares l
    where v.lugar_id = l.id and v.reservation_id = p_id and l.cidade is distinct from v_cidade
    returning l.id
  )
  update cidade_lugares set ocorrencias = greatest(ocorrencias - 1, 0) where id in (select id from apagadas);

  if r.deleted_at is not null or r.type::text <> 'passagem' or v_cidade is null
     or r.status::text not in ('confirmada', 'embarcado') then
    return;
  end if;

  for c in select * from fn_lugares_citados(concat_ws(', ', r.pickup_detail, r.street, r.reference_point)) loop
    insert into cidade_lugares (cidade, nome, nucleo, tipo, fonte)
    values (v_cidade, fn_nome_do_lugar(c.nucleo, c.tipo), c.nucleo, c.tipo, 'reservas')
    on conflict (cidade, nucleo) do nothing;
    select id into v_lugar from cidade_lugares where cidade = v_cidade and nucleo = c.nucleo;
    insert into cidade_lugares_vistas (reservation_id, lugar_id) values (p_id, v_lugar) on conflict do nothing;
    if found then
      update cidade_lugares set ocorrencias = ocorrencias + 1, ultima_vez = now() where id = v_lugar;
    end if;
  end loop;
end $$;
revoke all on function public.fn_aprender_lugares_da_reserva(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_aprender_lugares()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform fn_aprender_lugares_da_reserva(new.id);
  exception when others then
    raise warning 'aprender lugares (reserva %): %', new.id, sqlerrm; -- nunca derruba a reserva
  end;
  return new;
end $$;

drop trigger if exists trg_reservations_aprende_lugares on public.reservations;
create trigger trg_reservations_aprende_lugares
  after insert or update of status, route_point_id, trip_id, pickup_detail, street, reference_point, deleted_at
  on public.reservations
  for each row execute function fn_trg_aprender_lugares();

-- ---------------------------------------------------------------------
-- 5. Semente do mapa (OpenStreetMap, 10/11/2026): povoados e escolas
-- ---------------------------------------------------------------------
insert into public.cidade_lugares (cidade, nome, nucleo, tipo, fonte)
select s.cidade, s.nome, fn_normalizar_local(s.nucleo), s.tipo, 'mapa'
from (values
  ('pirapemas', 'Povoado São Bartolomeu', 'sao bartolomeu', 'povoado'),
  ('pirapemas', 'Povoado Pedras', 'pedras', 'povoado'),
  ('cantanhede', 'Povoado Galvão', 'galvao', 'povoado'),
  ('cantanhede', 'Povoado Mangueirão', 'mangueirao', 'povoado'),
  ('cantanhede', 'Povoado Vila Monteiro', 'vila monteiro', 'povoado'),
  ('cantanhede', 'Povoado Vila Palmeira', 'vila palmeira', 'povoado'),
  ('cantanhede', 'Povoado Primavera', 'primavera', 'povoado'),
  ('cantanhede', 'Povoado Morro da Pimenta', 'morro da pimenta', 'povoado'),
  ('cantanhede', 'Povoado Candiba', 'candiba', 'povoado'),
  ('cantanhede', 'Povoado Garrafinha', 'garrafinha', 'povoado'),
  ('cantanhede', 'Povoado Trizidela', 'trizidela', 'povoado'),
  ('cantanhede', 'Cajuí', 'cajui', 'povoado'),
  ('pirapemas', 'Centro de Ensino Pirapemas', 'centro de ensino pirapemas', 'referencia'),
  ('pirapemas', 'Centro de Ensino Ribamar Pinheiro', 'ribamar pinheiro', 'referencia'),
  ('pirapemas', 'JI Pato Donald', 'pato donald', 'referencia'),
  ('cantanhede', 'Centro de Ensino Getúlio Vargas', 'getulio vargas', 'referencia'),
  ('cantanhede', 'Creche Municipal Raimundo João Ferreira', 'raimundo joao ferreira', 'referencia'),
  ('cantanhede', 'EM Desembargador Sarney Costa', 'sarney costa', 'referencia'),
  ('cantanhede', 'EM Hildo Oliveira Rocha', 'hildo oliveira rocha', 'referencia'),
  ('cantanhede', 'EM Leda Maria Chaves Tajra', 'leda maria chaves tajra', 'referencia'),
  ('cantanhede', 'EM Professor José de Melo e Silva', 'jose de melo e silva', 'referencia'),
  ('cantanhede', 'EM Professora Isabel dos Santos Sousa', 'isabel dos santos sousa', 'referencia'),
  ('cantanhede', 'Escola Especializada Maria Izeuda Evangelista (Pestalozzi)', 'pestalozzi', 'referencia'),
  ('cantanhede', 'Escola Municipal Nilza Amorim Rocha', 'nilza amorim', 'referencia'),
  ('cantanhede', 'JI Francisco de Assis Ximenes Aragão Filho', 'ximenes aragao', 'referencia'),
  ('cantanhede', 'Jardim de Infância Antônio Henriques Leal', 'henriques leal', 'referencia'),
  ('cantanhede', 'Jardim de Infância Pedro Freitas Caldas', 'pedro freitas caldas', 'referencia'),
  ('cantanhede', 'Avenida Dr. Luís Sousa Guimarães', 'luis sousa guimaraes', 'rua'),
  ('cantanhede', 'Avenida Dr. Luís (apelido)', 'dr luis', 'rua')
) as s(cidade, nome, nucleo, tipo)
on conflict (cidade, nucleo) do nothing;

-- ruas da 76 continuam 'rua'; zera o que foi aprendido e reaprende todo o histórico com a leitura nova
do $$ begin
  delete from cidade_lugares_vistas;
  delete from cidade_lugares where fonte = 'reservas';
  update cidade_lugares set ocorrencias = 0, ultima_vez = null;
  perform fn_aprender_lugares_da_reserva(r.id)
  from reservations r join trips t on t.id = r.trip_id
  where t.direction = 'volta' and r.deleted_at is null;
end $$;

-- o mapa grafou "José Samey": é a Rua José Sarney (Cantanhede)
update public.cidade_lugares set tipo = 'rua', nome = 'Rua José Sarney', fonte = 'mapa'
where cidade = 'cantanhede' and nucleo = 'jose sarney';
delete from public.cidade_lugares where cidade = 'cantanhede' and nucleo = 'jose samey';
