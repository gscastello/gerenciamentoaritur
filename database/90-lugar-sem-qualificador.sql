-- =====================================================================
-- ROTA PIRAPEMAS — 90: "DESCIDA DA INÊS" É A INÊS (#299)
-- =====================================================================
-- Rodar depois de 01–89. Idempotente.
-- O cliente diz onde fica em relação a um lugar conhecido: "descida da Inês",
-- "subida do Posto", "entrada do Campinho", "perto da Igreja". O pedaço inteiro
-- não existe na base de lugares, e a cidade da Volta não era reconhecida. Agora,
-- além do pedaço inteiro, vale o lugar sem essas palavras do começo, se ele
-- existir na base (cidade_lugares). Igual para os lugares de São Luís.
-- Só ajuda a reconhecer: nada decide preço ou vaga.
-- =====================================================================

create or replace function public.fn_sem_qualificador(p_nucleo text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(p_nucleo, ''),
    '^(descida|subida|ladeira|entrada|saida|beco|perto|proximo|lado|frente|depois|antes|esquina|atras|vizinho|vizinha|defronte)( (de|da|do|das|dos|ao|a|o))? ', '')
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
    -- "descida da ines" → "ines", se a Inês existe na base
    select l.tipo, l.nucleo, null from base b
    join cidade_lugares l on l.nucleo = fn_sem_qualificador(b.nucleo)
    where fn_sem_qualificador(b.nucleo) <> b.nucleo
    union all
    select l.tipo, l.nucleo, null from cidade_lugares l
    where fn_nucleo_forte(l.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || l.nucleo || ' %')
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc, (t.escrito is null) desc
$$;

create or replace function public.fn_bairro_pelo_endereco(p_texto text)
returns table (bairro text, lugar text, tipo text, ocorrencias integer, confirmado boolean, fonte text)
language sql stable security definer set search_path = public as $$
  with pedacos as (
    select distinct p.nucleo, fn_nucleo_sem_tipo(fn_sem_qualificador(p.nucleo)) curto
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
