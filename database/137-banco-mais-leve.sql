-- 137-banco-mais-leve.sql — issue #518
--
-- Mesmo resultado, menos trabalho (medido em 24/11: a procura de lugares levava ~240 ms por chamada e o
-- app parava quando várias rodavam juntas). Nada muda no que as funções devolvem:
--   1) fn_distancia_palavra: atalho com levenshtein (a distância usada, com troca de letras vizinhas, é
--      no mínimo a metade dele e nunca maior que ele);
--   2) colunas calculadas em cidade_lugares e sao_luis_lugares no lugar de regex por linha;
--   3) fn_pedacos_do_endereco, fn_lugares_citados, fn_lugar_parecido e fn_bairro_pelo_endereco: conta
--      cara uma vez só, depois de um filtro barato que nunca descarta o que passaria;
--   4) fn_rascunho_ja_reservado e fn_fechar_pendencias_resolvidas: cliente do telefone procurado uma vez;
--   5) v_app_notifications lê as leituras pela chave; fn_antes_do_pedido sai na hora para o bot.

create extension if not exists fuzzystrmatch with schema extensions;

create or replace function public.fn_distancia_palavra(a text, b text)
returns integer
language plpgsql
immutable strict
set search_path to 'public'
as $function$
declare
  n int := length(a);
  m int := length(b);
  d int[];
  i int; j int; custo int; w int := m + 1;
  v int;
begin
  if a = b then return 0; end if;
  if n = 0 then return m; end if;
  if m = 0 then return n; end if;
  if abs(n - m) > 2 then return 3; end if;
  -- quem chama só aceita até 2: acima de 4 no levenshtein, a daqui é 3 ou mais; até 1, é a mesma
  v := extensions.levenshtein_less_equal(a, b, 4);
  if v > 4 then return 3; end if;
  if v <= 1 then return v; end if;
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
end $function$;

-- palavras sem "da/de/do/das/dos", como fn_distancia_grafia compara
create or replace function public.fn_sem_particulas(p_texto text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select btrim(regexp_replace(' ' || fn_normalizar_local(p_texto) || ' ', ' (da|de|do|das|dos)(?= )', '', 'g'))
$function$;

alter table public.cidade_lugares
  add column if not exists nucleo_forte boolean generated always as (public.fn_nucleo_forte(nucleo)) stored,
  add column if not exists nucleo_palavras integer
    generated always as (array_length(regexp_split_to_array(nucleo, ' '), 1)) stored,
  add column if not exists nucleo_grafia text generated always as (public.fn_sem_particulas(nucleo)) stored;
alter table public.sao_luis_lugares
  add column if not exists nucleo_sem_tipo text generated always as (public.fn_nucleo_sem_tipo(nucleo)) stored,
  add column if not exists nucleo_grafia text
    generated always as (public.fn_sem_particulas(public.fn_nucleo_sem_tipo(nucleo))) stored;
create index if not exists idx_cidade_lugares_nucleo on public.cidade_lugares (nucleo);
create index if not exists idx_sao_luis_lugares_nucleo on public.sao_luis_lugares (nucleo);

-- as duas buscas caras dentro de fn_pedacos_do_endereco (o resto da função fica igual)
do $do$
declare
  d text := pg_get_functiondef('public.fn_pedacos_do_endereco(text)'::regprocedure);
  a1 text := 'where l.tipo = ''rua'' and fn_nucleo_forte(l.nucleo) and (seg || '' '') like (l.nucleo || '' %'')';
  b1 text := 'where l.tipo = ''rua'' and l.nucleo_forte and (seg || '' '') like (l.nucleo || '' %'')';
  i int; f int;
  b2 text := $b$select l.nucleo, l.nucleo_palavras palavras into ruaf
    from cidade_lugares l
    cross join lateral (
      select case when extensions.similarity(l.nucleo, seg) > 0.2
                  then fn_distancia_grafia(array_to_string(w[1:l.nucleo_palavras], ' '), l.nucleo) end d
      offset 0) z
    where l.tipo = 'rua' and l.nucleo_forte and array_length(w, 1) >= l.nucleo_palavras and z.d is not null
    order by z.d, length(l.nucleo) desc
    limit 1;$b$;
begin
  if position('l.nucleo_palavras palavras into ruaf' in d) > 0 then return; end if;
  if position(a1 in d) = 0 then raise exception 'fn_pedacos: trecho 1 não encontrado'; end if;
  d := replace(d, a1, b1);
  i := position('select l.nucleo, array_length(regexp_split_to_array(l.nucleo, '' ''), 1) palavras into ruaf' in d);
  if i = 0 then raise exception 'fn_pedacos: trecho 2 não encontrado'; end if;
  f := position('limit 1;' in substr(d, i)) + i + length('limit 1;') - 2;
  d := substr(d, 1, i - 1) || b2 || substr(d, f + 1);
  execute d;
end
$do$;

create or replace function public.fn_lugares_citados(p_texto text)
returns table(tipo text, nucleo text, escrito text)
language sql
stable
set search_path to 'public'
as $function$
  with t0 as materialized (select ' ' || fn_normalizar_local(p_texto) || ' ' as n),
  pedacos as (
    select p.tipo, p.nucleo, p.escrito,
           case when p.escrito is null and not exists (select 1 from cidade_lugares l where l.nucleo = p.nucleo)
                then fn_lugar_parecido(p.nucleo, p.tipo) end corrigido
    from fn_pedacos_do_endereco(p_texto) p
  ),
  base as (
    select p.tipo, coalesce(p.corrigido, p.nucleo) nucleo,
           coalesce(p.escrito, case when p.corrigido is not null and p.corrigido <> p.nucleo then p.nucleo end) escrito
    from pedacos p
  ),
  fortes as (
    select l.tipo, l.nucleo from cidade_lugares l, t0
    where l.nucleo_forte
      and t0.n like ('% ' || l.nucleo || ' %')
      and not (l.tipo = 'rua' and t0.n
               ~ ('(beco|travessa|trav|tv|ladeira|estrada|estr|praca|pca|vila|alameda|rodovia|passagem|conjunto|residencial|condominio|povoado) ' || l.nucleo || ' '))
  )
  select distinct on (t.nucleo) t.tipo, t.nucleo, t.escrito from (
    select b.tipo, b.nucleo, b.escrito from base b
    union all
    select l.tipo, l.nucleo, null from (select nucleo from base union select nucleo from fortes) q
    join cidade_lugares l on l.nucleo = fn_sem_qualificador(q.nucleo)
    where fn_sem_qualificador(q.nucleo) <> q.nucleo
    union all
    select f.tipo, f.nucleo, null from fortes f
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc, (t.escrito is null) desc
$function$;

create or replace function public.fn_lugar_parecido(p_nucleo text, p_tipo text)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  achado text;
  quantos int;
  g_texto text := fn_sem_particulas(p_nucleo);
  g_espacos int := length(g_texto) - length(replace(g_texto, ' ', ''));
  palavras int := (select count(*) from unnest(regexp_split_to_array(p_nucleo, ' ')) x
                   where x <> '' and x not in ('da', 'de', 'do', 'das', 'dos'));
begin
  select l.nucleo into achado
  from cidade_lugares_grafias g join cidade_lugares l on l.id = g.lugar_id
  where g.grafia = p_nucleo and (palavras >= 2 or l.tipo = p_tipo)
  order by g.vezes desc limit 1;
  if achado is not null then return achado; end if;

  -- o único com menos erros; empate entre lugares diferentes não decide. Até 2 erros: mesma quantidade de
  -- palavras e tamanho com no máximo 2 letras de diferença (filtro barato antes da conta cara)
  with z as materialized (
    select q.nucleo, fn_distancia_grafia(p_nucleo, q.nucleo) erros
    from (select distinct l.nucleo from cidade_lugares l
           where abs(length(l.nucleo_grafia) - length(g_texto)) <= 2
             and length(l.nucleo_grafia) - length(replace(l.nucleo_grafia, ' ', '')) = g_espacos
             and extensions.similarity(l.nucleo, p_nucleo) > 0.2
             and (palavras >= 2 or l.tipo = p_tipo)) q
  ),
  m as (select min(z.erros) e from z)
  select max(z.nucleo), count(*) into achado, quantos from z, m where z.erros = m.e;
  return case when quantos = 1 then achado end;
end $function$;

create or replace function public.fn_bairro_pelo_endereco(p_texto text)
returns table(bairro text, lugar text, tipo text, ocorrencias integer, confirmado boolean, fonte text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with pedacos as materialized (
    select q.nucleo, q.curto, fn_sem_particulas(q.curto) grafia
    from (
      select distinct p.nucleo, fn_nucleo_sem_tipo(fn_sem_qualificador(p.nucleo)) curto
      from fn_pedacos_do_endereco(p_texto) p where fn_pedaco_util_sao_luis(p.nucleo)
    ) q
  )
  select distinct on (l.id) l.bairro, l.nome, l.tipo, l.ocorrencias, l.confirmado, l.fonte
  from sao_luis_lugares l
  join pedacos p on p.nucleo = l.nucleo
     or (length(p.curto) >= 6 and p.curto = l.nucleo_sem_tipo)
     or (length(p.curto) >= 8 and l.nucleo_sem_tipo like p.curto || ' %')
     or (length(l.nucleo_sem_tipo) >= 8 and p.curto like l.nucleo_sem_tipo || ' %')
     -- até 1 erro: o tamanho sem as partículas difere no máximo 1 (filtro barato antes da conta cara)
     or (length(l.nucleo) >= 8 and abs(length(p.grafia) - length(l.nucleo_grafia)) <= 1
         and coalesce(fn_distancia_grafia(p.curto, l.nucleo_sem_tipo), 99) <= 1)
  where l.ocorrencias > 0 or l.confirmado
  order by l.id, l.confirmado desc, l.ocorrencias desc
$function$;

-- o cliente do telefone é procurado uma vez, não por reserva
create or replace function public.fn_rascunho_ja_reservado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reserva uuid;
  v_cliente uuid;
begin
  if new.status <> 'pronta' or new.trip_date is null or new.direction is null then
    return new;
  end if;
  v_cliente := case when new.phone is not null then fn_cliente_por_telefone(new.phone) end;
  select r.id into v_reserva
    from reservations r
    join trips t on t.id = r.trip_id
   where r.deleted_at is null
     and r.status <> 'cancelada'
     and t.trip_date = new.trip_date
     and t.direction::text = new.direction::text
     and r.type::text = coalesce(new.type::text, 'passagem')
     and (r.customer_id = new.customer_id or r.customer_id = v_cliente)
   order by r.created_at desc
   limit 1;
  if v_reserva is not null then
    new.status := 'lancada';
    new.reservation_id := v_reserva;
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
exception when others then
  return new;
end $function$;

do $do$
declare
  d text := pg_get_functiondef('public.fn_fechar_pendencias_resolvidas()'::regprocedure);
  a1 text := 'coalesce(nullif(t.phone, ''''), w.phone) as fone';
  b1 text := 'coalesce(nullif(t.phone, ''''), w.phone) as fone,
           array(select c.id from (select fn_variantes_telefone(coalesce(nullif(t.phone, ''''), w.phone)) f offset 0) v
                   join customers c on c.phone = any(v.f)) as clientes';
  a2 text := 'and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(p.fone))';
  b2 text := 'and c.id = any(p.clientes)';
begin
  if position('as clientes' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or (length(d) - length(replace(d, a2, ''))) / length(a2) <> 2 then
    raise exception 'fn_fechar_pendencias_resolvidas: trecho não encontrado';
  end if;
  execute replace(replace(d, a1, b1), a2, b2);
end
$do$;

create or replace view public.v_app_notifications with (security_invoker = true) as
select n.id, n.kind, n.title, n.body, n.reservation_id, n.trip_date, n.direction, n.meta, n.created_at,
       (r.notification_id is not null) as lida,
       (r.cleared_at is not null) as limpada
  from app_notifications n
  left join app_notification_reads r on r.notification_id = n.id and r.user_id = (select auth.uid())
 order by n.created_at desc;

-- o bot (service_role) não tem usuário: sai sem consultar nada
create or replace function public.fn_antes_do_pedido()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sub text := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '');
begin
  if v_sub is null then return; end if;
  perform 1 from users where id = v_sub::uuid and somente_leitura;
  if found then
    perform set_config('transaction_read_only', 'on', true);
  end if;
end;
$function$;

-- Provado antes de aplicar (24/11): 185 textos reais com o resultado idêntico nas funções de lugares, 91
-- em fn_lugar_parecido, e a visão de notificações linha a linha. Tempos: lugares 237 -> 45 ms, bairro
-- 90 -> 13 ms, fn_fechar_pendencias_resolvidas 1.700 -> 36 ms, notificações 165 -> 16 ms.
