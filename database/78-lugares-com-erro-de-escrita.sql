-- =====================================================================
-- ROTA PIRAPEMAS — 78: LUGARES ESCRITOS COM ERRO (#276)
-- =====================================================================
-- Rodar depois de 01–77. Idempotente.
-- Cliente escreve "listre caldas", "choparia do riba", "muacir andrade". A base de
-- lugares (77) passa a reconhecer o lugar certo com erro pequeno de escrita e a
-- GUARDAR as grafias que aparecem (cidade_lugares_grafias), ligadas ao lugar certo.
-- Regra igual à do bot (_shared/grafia.ts): palavra por palavra, sem "da/de/do";
-- até 3 letras tem de ser igual ("Bia" ≠ "Lia"); 4–8 letras aceitam 1 erro; 9+ aceitam
-- 2; no máximo 2 erros no total. Só ajuda a reconhecer: nunca decide a cidade.
-- =====================================================================

create table if not exists public.cidade_lugares_grafias (
  lugar_id    uuid not null references public.cidade_lugares(id) on delete cascade,
  grafia      text not null,
  vezes       integer not null default 0,
  ultima_vez  timestamptz not null default now(),
  primary key (lugar_id, grafia)
);
create index if not exists idx_cidade_lugares_grafias_grafia on public.cidade_lugares_grafias (grafia);
alter table public.cidade_lugares_grafias enable row level security;
drop policy if exists cidade_lugares_grafias_select on public.cidade_lugares_grafias;
create policy cidade_lugares_grafias_select on public.cidade_lugares_grafias
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));
drop policy if exists cidade_lugares_grafias_admin on public.cidade_lugares_grafias;
create policy cidade_lugares_grafias_admin on public.cidade_lugares_grafias
  for all using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));
grant select, delete on public.cidade_lugares_grafias to authenticated;

-- ---------------------------------------------------------------------
-- Distância entre palavras (Damerau/OSA: troca, falta, sobra, invertidas = 1)
-- ---------------------------------------------------------------------
create or replace function public.fn_distancia_palavra(a text, b text)
returns integer language plpgsql immutable strict as $$
declare
  n int := length(a);
  m int := length(b);
  d int[];
  i int; j int; custo int; w int := m + 1;
begin
  if a = b then return 0; end if;
  if n = 0 then return m; end if;
  if m = 0 then return n; end if;
  if abs(n - m) > 2 then return 3; end if; -- longe demais: não interessa o valor exato
  d := array_fill(0, array[(n + 1) * w]);
  for i in 0 .. n loop d[i * w + 1] := i; end loop;
  for j in 0 .. m loop d[j + 1] := j; end loop;
  for i in 1 .. n loop
    for j in 1 .. m loop
      custo := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      d[i * w + j + 1] := least(d[(i - 1) * w + j + 1] + 1, d[i * w + j] + 1, d[(i - 1) * w + j] + custo);
      if i > 1 and j > 1 and substr(a, i, 1) = substr(b, j - 1, 1) and substr(a, i - 1, 1) = substr(b, j, 1) then
        d[i * w + j + 1] := least(d[i * w + j + 1], d[(i - 2) * w + j - 1] + 1);
      end if;
    end loop;
  end loop;
  return d[n * w + m + 1];
end $$;

-- Erros entre o escrito e o nome certo, ou null se não é o mesmo nome.
create or replace function public.fn_distancia_grafia(p_escrito text, p_certo text)
returns integer language plpgsql immutable set search_path = public as $$
declare
  a text[];
  b text[];
  i int;
  d int;
  tol int;
  total int := 0;
begin
  select coalesce(array_agg(x), '{}') into a
  from unnest(regexp_split_to_array(fn_normalizar_local(p_escrito), ' ')) x where x <> '' and x not in ('da','de','do','das','dos');
  select coalesce(array_agg(x), '{}') into b
  from unnest(regexp_split_to_array(fn_normalizar_local(p_certo), ' ')) x where x <> '' and x not in ('da','de','do','das','dos');
  if coalesce(array_length(a, 1), 0) = 0 or coalesce(array_length(a, 1), 0) <> coalesce(array_length(b, 1), 0) then
    return null;
  end if;
  for i in 1 .. array_length(a, 1) loop
    d := fn_distancia_palavra(a[i], b[i]);
    tol := case when length(b[i]) <= 3 then 0 when length(b[i]) <= 8 then 1 else 2 end;
    if d > tol then return null; end if;
    total := total + d;
  end loop;
  return case when total <= 2 then total end;
end $$;

-- O lugar conhecido que o pedaço quer dizer (grafia já vista, ou o mais parecido sem empate).
create or replace function public.fn_lugar_parecido(p_nucleo text)
returns text language plpgsql stable set search_path = public as $$
declare
  achado text;
  melhor record;
  segundo record;
begin
  select l.nucleo into achado
  from cidade_lugares_grafias g join cidade_lugares l on l.id = g.lugar_id
  where g.grafia = p_nucleo order by g.vezes desc limit 1;
  if achado is not null then return achado; end if;

  select * into melhor from (
    select l.nucleo, fn_distancia_grafia(p_nucleo, l.nucleo) erros, sum(l.ocorrencias) n
    from cidade_lugares l
    where extensions.similarity(l.nucleo, p_nucleo) > 0.2
    group by l.nucleo
  ) z where z.erros is not null order by z.erros, z.n desc limit 1;
  if melhor.nucleo is null then return null; end if;
  select * into segundo from (
    select l.nucleo, fn_distancia_grafia(p_nucleo, l.nucleo) erros
    from cidade_lugares l
    where extensions.similarity(l.nucleo, p_nucleo) > 0.2 and l.nucleo <> melhor.nucleo
    group by l.nucleo
  ) z where z.erros = melhor.erros limit 1;
  if segundo.nucleo is not null then return null; end if; -- dois lugares igualmente parecidos: não chuta
  return melhor.nucleo;
end $$;

-- ---------------------------------------------------------------------
-- Pedaços do endereço agora dizem como o cliente escreveu (escrito) quando corrigido
-- ---------------------------------------------------------------------
drop function if exists public.fn_lugares_no_texto(text);
drop function if exists public.fn_lugares_citados(text);
drop function if exists public.fn_pedacos_do_endereco(text);

create or replace function public.fn_pedacos_do_endereco(p_texto text)
returns table (tipo text, nucleo text, escrito text) language plpgsql stable set search_path = public as $$
declare
  t text;
  seg text;
  fila text[];
  w text[];
  n int;
  k int;
  achado text;
  ruaf record;
  prefixos text[] := array['rua','r','avenida','av','travessa','trav','tv','praca','estrada','beco','rodovia','alameda'];
  artigos text[] := array['o','a','os','as','ao','aos','da','do','das','dos','de','na','no','nas','nos','em','com','ate','pela','pelo','lado'];
  pessoa text[] := array['casa','mae','vo','seu','dona'];
  lugar text[] := fn_palavras_de_lugar();
begin
  t := translate(lower(coalesce(p_texto, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  t := regexp_replace(t, '\+ ?55', ' ', 'g');
  t := replace(t, '.', ' ');
  t := regexp_replace(t, '\m(proximo|proxima|prox|perto|ao lado|do lado|em frente|frente|defronte|atras|depois|apos|antes|esquina com|esquina|vizinho|vizinha|junto|em cima|embaixo|entre|e)\M', '|', 'g');
  t := regexp_replace(t, '\m(final|fim|inicio|comeco|meio) d[ao] rua\M|\multim[ao] casa\M', '|', 'g');
  t := regexp_replace(t, '\m(pra|para)\M[^|,;]*', '|', 'g');
  t := regexp_replace(t, '([a-z0-9]) (casa d|mae d|vo d|seu |dona )', '\1|\2', 'g');

  fila := regexp_split_to_array(t, '[|,;:/()\n–—-]');
  while coalesce(array_length(fila, 1), 0) > 0 loop
    seg := fila[1];
    fila := fila[2:];
    escrito := null;
    w := regexp_split_to_array(btrim(regexp_replace(seg, '[^a-z0-9]+', ' ', 'g')), ' ');
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

    if w[1] = any(prefixos) and array_length(w, 1) >= 2 then
      n := array_length(w, 1);
      for k in 2 .. array_length(w, 1) loop
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

    -- rua conhecida citada sem "Rua", exata ou com erro ("listre caldas rose bronze")
    select l.nucleo into achado from cidade_lugares l
    where l.tipo = 'rua' and fn_nucleo_forte(l.nucleo) and (seg || ' ') like (l.nucleo || ' %')
    order by length(l.nucleo) desc limit 1;
    if achado is not null then
      tipo := 'rua'; nucleo := achado; return next;
      seg := btrim(substr(seg, length(achado) + 1));
      if seg <> '' then fila := array_prepend(seg, fila); end if;
      continue;
    end if;
    select l.nucleo, array_length(regexp_split_to_array(l.nucleo, ' '), 1) palavras into ruaf
    from cidade_lugares l
    where l.tipo = 'rua' and fn_nucleo_forte(l.nucleo)
      and extensions.similarity(l.nucleo, seg) > 0.2
      and array_length(w, 1) >= array_length(regexp_split_to_array(l.nucleo, ' '), 1)
      and fn_distancia_grafia(array_to_string(w[1:array_length(regexp_split_to_array(l.nucleo, ' '), 1)], ' '), l.nucleo) is not null
    order by fn_distancia_grafia(array_to_string(w[1:array_length(regexp_split_to_array(l.nucleo, ' '), 1)], ' '), l.nucleo), length(l.nucleo) desc
    limit 1;
    if ruaf.nucleo is not null then
      tipo := 'rua'; nucleo := ruaf.nucleo; escrito := array_to_string(w[1:ruaf.palavras], ' ');
      if escrito = nucleo then escrito := null; end if;
      return next;
      escrito := null;
      if array_length(w, 1) > ruaf.palavras then fila := array_prepend(array_to_string(w[ruaf.palavras + 1:], ' '), fila); end if;
      continue;
    end if;

    if seg ~ '^[0-9]+ de [a-z]+$' or exists (select 1 from cidade_lugares l where l.tipo = 'rua' and l.nucleo = seg) then
      tipo := 'rua'; nucleo := seg; return next;
      continue;
    end if;

    tipo := case when w[1] = any(pessoa) and array_length(w, 1) >= 2 then 'casa' else 'referencia' end;
    nucleo := array_to_string(w[1:least(array_length(w, 1), 5)], ' ');
    continue when nucleo !~ '[a-z]{3,}'
      or nucleo ~ '^(casa|portao|predio|muro)( (de|da|do))? ?(amarel|azul|verde|branc|cinz|rosa|vermelh|pret|laranj|bege|roxo|marrom)'
      or nucleo ~ '^(final|ultima|ultimo|entrada|saida|inicio|meio)( |$)'
      or nucleo in ('casa', 'rua', 'bairro', 'encomenda', 'sozinho', 'sozinha', 'miranda', 'sao luis', 'quebra mola', 'mesmo lugar', 'mesmo local', 'aqui');
    return next;
  end loop;
end $$;

-- Lugares citados: pedaços (corrigidos para o lugar conhecido quando escritos com erro)
-- + lugares fortes conhecidos citados no meio do texto.
create or replace function public.fn_lugares_citados(p_texto text)
returns table (tipo text, nucleo text, escrito text) language sql stable set search_path = public as $$
  with pedacos as (
    select p.tipo, p.nucleo, p.escrito,
           case when p.escrito is null and not exists (select 1 from cidade_lugares l where l.nucleo = p.nucleo)
                then fn_lugar_parecido(p.nucleo) end corrigido
    from fn_pedacos_do_endereco(p_texto) p
  )
  select distinct on (t.nucleo) t.tipo, t.nucleo, t.escrito from (
    select p.tipo, coalesce(p.corrigido, p.nucleo) nucleo,
           coalesce(p.escrito, case when p.corrigido is not null and p.corrigido <> p.nucleo then p.nucleo end) escrito
    from pedacos p
    union all
    select l.tipo, l.nucleo, null from cidade_lugares l
    where fn_nucleo_forte(l.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || l.nucleo || ' %')
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc, (t.escrito is null) desc
$$;

create or replace function public.fn_lugares_no_texto(p_texto text)
returns table (tipo text, nucleo text, nome text, em_pirapemas boolean, em_cantanhede boolean,
               reservas_pirapemas integer, reservas_cantanhede integer,
               junto_pirapemas text, junto_cantanhede text, escrito text)
language sql stable security definer set search_path = public as $$
  with citados as (select * from fn_lugares_citados(p_texto)),
  base as (
    select l.* from cidade_lugares l where l.nucleo in (select c.nucleo from citados c)
  ),
  junto as (
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
         max(j.nome) filter (where b.cidade = 'cantanhede'),
         (select c.escrito from citados c where c.nucleo = b.nucleo limit 1)
  from base b left join junto j on j.id = b.id
  group by b.nucleo
$$;
revoke all on function public.fn_lugares_no_texto(text) from public, anon;
grant execute on function public.fn_lugares_no_texto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Aprender: o lugar certo conta a reserva e a grafia errada fica guardada
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
      if c.escrito is not null then
        insert into cidade_lugares_grafias (lugar_id, grafia, vezes) values (v_lugar, c.escrito, 1)
        on conflict (lugar_id, grafia) do update set vezes = cidade_lugares_grafias.vezes + 1, ultima_vez = now();
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.fn_aprender_lugares_da_reserva(uuid) from public, anon, authenticated;

-- reaprende o histórico juntando as grafias erradas ao lugar certo
do $$ begin
  delete from cidade_lugares_grafias;
  delete from cidade_lugares_vistas;
  delete from cidade_lugares where fonte = 'reservas';
  update cidade_lugares set ocorrencias = 0, ultima_vez = null;
  perform fn_aprender_lugares_da_reserva(r.id)
  from reservations r join trips t on t.id = r.trip_id
  where t.direction = 'volta' and r.deleted_at is null
  order by r.created_at;
end $$;
