-- =====================================================================
-- ROTA PIRAPEMAS — 91: NOME PRÓPRIO É NOME PRÓPRIO (#301)
-- =====================================================================
-- Rodar depois de 01–90. Idempotente.
-- Pedido do dono (11/11): "Beco do Hospital" é diferente de "Hospital" e de
-- "Rua do Hospital". Até aqui a chave do lugar (núcleo) tirava o tipo do
-- logradouro — Rua, Avenida, Travessa, Praça, Estrada, Beco… — e "Beco da
-- Mangueira" e "Rua da Mangueira" viravam a mesma chave "da mangueira". E a
-- 90 cortava "beco/entrada/ladeira…" do começo.
-- Agora:
--   1) só Rua e Avenida saem da chave (o cliente troca uma pela outra);
--      Travessa, Praça, Estrada, Beco, Alameda e Rodovia FICAM ("beco da mangueira");
--   2) nome de rua conhecido não é achado dentro de outro logradouro
--      ("Rua do Hospital" não aparece em "Beco do Hospital");
--   3) "descida da…" e "subida da…" valem como o lugar inteiro E o lugar de perto
--      ("descida da Inês" também é a Inês); as outras palavras de posição —
--      perto, atrás, em frente… — o separador de endereço já tratava;
--   4) as bases de lugares são recalculadas com a regra nova (mapa + tudo o
--      que as reservas ensinaram), nas cidades e em São Luís.
-- As asserções no fim travam essas regras.
-- =====================================================================

create or replace function public.fn_nucleo_rua(p_nome text)
returns text language sql immutable set search_path = public as $$
  with n as (select fn_normalizar_local(p_nome) t),
  tp as (
    select t,
           case when t ~ '^(travessa|trav|tv) ' then 'travessa'
                when t ~ '^(praca|pca) ' then 'praca'
                when t ~ '^(estrada|estr) ' then 'estrada'
                when t ~ '^beco ' then 'beco'
                when t ~ '^alameda ' then 'alameda'
                when t ~ '^rodovia ' then 'rodovia' end tipo
    from n
  ),
  resto as (
    select tipo, regexp_replace(t, '^(travessa|trav|tv|praca|pca|estrada|estr|beco|alameda|rodovia) ', '') r from tp
  )
  select btrim(concat_ws(' ', tipo, btrim(regexp_replace(r,
    '^((rua|r|avenida|av|deputado|dep|desembargador|des|senador|sen|engenheiro|eng|doutor|dr|professor|prof|padre|pe|governador|gov|presidente|pres|coronel|cel|vereador|prefeito|dom|marechal|general|capitao|major|tenente) )+',
    ''))))
  from resto
$$;

create or replace function public.fn_sem_qualificador(p_nucleo text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(p_nucleo, ''), '^(descida|subida)( (de|da|do|das|dos|ao|a|o))? ', '')
$$;

create or replace function public.fn_lugares_citados(p_texto text)
returns table (tipo text, nucleo text, escrito text)
language sql stable set search_path = public as $$
  with pedacos as (
    select p.tipo, p.nucleo, p.escrito,
           case when p.escrito is null and not exists (select 1 from cidade_lugares l where l.nucleo = p.nucleo)
                then fn_lugar_parecido(p.nucleo, p.tipo) end corrigido
    from fn_pedacos_do_endereco(p_texto) p
  ),
  base as (
    select p.tipo, coalesce(p.corrigido, p.nucleo) nucleo,
           coalesce(p.escrito, case when p.corrigido is not null and p.corrigido <> p.nucleo then p.nucleo end) escrito
    from pedacos p
  )
  select distinct on (t.nucleo) t.tipo, t.nucleo, t.escrito from (
    select b.tipo, b.nucleo, b.escrito from base b
    union all
    -- "descida da ines" também é a "ines" (descida/subida só dizem a posição): vale o lugar inteiro E o de perto
    select l.tipo, l.nucleo, null from base b
    join cidade_lugares l on l.nucleo = fn_sem_qualificador(b.nucleo)
    where fn_sem_qualificador(b.nucleo) <> b.nucleo
    union all
    select l.tipo, l.nucleo, null from cidade_lugares l
    where fn_nucleo_forte(l.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || l.nucleo || ' %')
      -- "Beco do Hospital" não é a "Rua do Hospital": nome de rua logo depois de outro tipo de logradouro não vale
      and not (l.tipo = 'rua' and (' ' || fn_normalizar_local(p_texto) || ' ')
               ~ ('(beco|travessa|trav|tv|ladeira|estrada|estr|praca|pca|vila|alameda|rodovia|passagem|conjunto|residencial|condominio|povoado) ' || l.nucleo || ' '))
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc, (t.escrito is null) desc
$$;

create or replace function public.fn_bairro_pelo_endereco(p_texto text)
returns table (bairro text, lugar text, tipo text, ocorrencias integer, confirmado boolean, fonte text)
language sql stable security definer set search_path = public as $$
  with pedacos as (
    select distinct p.nucleo,
           fn_nucleo_sem_tipo(fn_sem_qualificador(p.nucleo)) curto
    from fn_pedacos_do_endereco(p_texto) p where fn_pedaco_util_sao_luis(p.nucleo)
  )
  select distinct on (l.id) l.bairro, l.nome, l.tipo, l.ocorrencias, l.confirmado, l.fonte
  from sao_luis_lugares l
  join pedacos p on p.nucleo = l.nucleo
     or (length(p.curto) >= 6 and p.curto = fn_nucleo_sem_tipo(l.nucleo))
     or (length(p.curto) >= 8 and fn_nucleo_sem_tipo(l.nucleo) like p.curto || ' %')
     or (length(fn_nucleo_sem_tipo(l.nucleo)) >= 8 and p.curto like fn_nucleo_sem_tipo(l.nucleo) || ' %')
     or (length(l.nucleo) >= 8 and coalesce(fn_distancia_grafia(p.curto, fn_nucleo_sem_tipo(l.nucleo)), 99) <= 1)
  where l.ocorrencias > 0 or l.confirmado
  order by l.id, l.confirmado desc, l.ocorrencias desc
$$;
revoke all on function public.fn_bairro_pelo_endereco(text) from public, anon;
grant execute on function public.fn_bairro_pelo_endereco(text) to authenticated;

-- ---------------------------------------------------------------------
-- Recalcula as bases com a regra nova
-- ---------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  -- Pirapemas/Cantanhede: chave das ruas do mapa (o nome do mapa guarda o tipo)
  update cidade_lugares l set nucleo = fn_nucleo_rua(l.nome), updated_at = now()
  where l.fonte = 'mapa' and l.tipo = 'rua' and fn_nucleo_rua(l.nome) <> l.nucleo
    and not exists (select 1 from cidade_lugares x where x.cidade = l.cidade and x.nucleo = fn_nucleo_rua(l.nome));
  -- o que as reservas ensinaram é reaprendido do zero (mesmas reservas, regra nova)
  delete from cidade_lugares_vistas;
  delete from cidade_lugares where fonte = 'reservas';
  update cidade_lugares set ocorrencias = 0;
  for v_id in
    select r.id from reservations r join trips t on t.id = r.trip_id join route_points rp on rp.id = r.route_point_id
    where t.direction = 'volta' and rp.code in ('pirapemas', 'cantanhede') and r.type = 'passagem'
      and r.deleted_at is null and r.status in ('confirmada', 'embarcado')
    order by r.created_at
  loop
    perform fn_aprender_lugares_da_reserva(v_id);
  end loop;

  -- São Luís: reaprende do zero (reservas + memória de endereços)
  delete from sao_luis_lugares_vistas;
  delete from sao_luis_lugares;
  insert into sao_luis_lugares (nucleo, nome, tipo, bairro, fonte, ocorrencias, confirmado)
  select distinct on (p.nucleo, a.bairro) p.nucleo, a.apelido, 'referencia', a.bairro,
         case when a.fonte = 'internet' then 'internet' else 'equipe' end, 1, coalesce(a.confirmado, false)
  from bairro_aliases a
  cross join lateral fn_pedacos_do_endereco(a.apelido) p
  where fn_pedaco_util_sao_luis(p.nucleo)
    and exists (select 1 from neighborhood_pricing np where fn_normalizar_local(np.neighborhood::text) = fn_normalizar_local(a.bairro))
  on conflict (nucleo, bairro) do nothing;
  for v_id in
    select r.id from reservations r join route_points rp on rp.id = r.route_point_id
    where rp.code = 'busca' and r.deleted_at is null and r.status in ('confirmada', 'embarcado') and r.pickup_neighborhood is not null
    order by r.created_at
  loop
    perform fn_aprender_sao_luis_da_reserva(v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------
do $$
begin
  if fn_nucleo_rua('Beco do Hospital') <> 'beco do hospital' then raise exception 'Beco do Hospital perdeu o "beco"'; end if;
  if fn_nucleo_rua('Rua do Hospital') <> 'do hospital' then raise exception 'Rua do Hospital mudou'; end if;
  if fn_nucleo_rua('Tv. da Paz') <> 'travessa da paz' then raise exception 'Tv. da Paz não virou travessa da paz'; end if;
  if fn_nucleo_rua('Praça da Cruz') <> 'praca da cruz' then raise exception 'Praça da Cruz perdeu a "praça"'; end if;
  if fn_nucleo_rua('Av. Deputado Lister Caldas') <> 'lister caldas' then raise exception 'Avenida/título não saiu'; end if;
  if fn_sem_qualificador('beco do hospital') <> 'beco do hospital' then raise exception 'beco do hospital foi cortado'; end if;
  if fn_sem_qualificador('entrada da cidade') <> 'entrada da cidade' then raise exception 'entrada da cidade foi cortada'; end if;
  if fn_sem_qualificador('ladeira do rosario') <> 'ladeira do rosario' then raise exception 'ladeira foi cortada'; end if;
  if fn_sem_qualificador('descida da ines') <> 'ines' then raise exception 'descida da ines não virou ines'; end if;
  if exists (select 1 from cidade_lugares where nucleo = 'ines')
     and not exists (select 1 from fn_lugares_citados('na descida da Inês') c where c.nucleo = 'ines') then
    raise exception 'descida da Inês não achou a Inês';
  end if;
  if exists (select 1 from fn_lugares_citados('Beco do Hospital, casa 3') c where c.nucleo in ('do hospital', 'hospital')) then
    raise exception 'Beco do Hospital virou Rua do Hospital ou Hospital';
  end if;
  if exists (select 1 from fn_pedacos_do_endereco('Beco da Mangueira') p where p.nucleo = 'da mangueira') then
    raise exception 'Beco da Mangueira virou Rua da Mangueira';
  end if;
  if exists (select 1 from cidade_lugares where fonte = 'mapa' and tipo = 'rua'
             and fn_normalizar_local(nome) ~ '^(beco|travessa|praca|estrada) ' and nucleo !~ '^(beco|travessa|praca|estrada) ') then
    raise exception 'sobrou rua do mapa com a chave sem o tipo';
  end if;
end $$;
