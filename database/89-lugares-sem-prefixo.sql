-- =====================================================================
-- ROTA PIRAPEMAS — 89: LUGAR DE SÃO LUÍS SEM "CONDOMÍNIO/RESIDENCIAL" (#297)
-- =====================================================================
-- Rodar depois de 01–88. Idempotente.
-- "Condomínio Jardim di Napoli" e "Jardim di Napoli" são o mesmo lugar: a busca
-- do bairro compara os núcleos sem a palavra de tipo do começo (condomínio,
-- residencial, conjunto, edifício…), e o começo do nome vale ("Belleville" acha
-- "Condomínio Belleville Residence").
-- =====================================================================

create or replace function public.fn_nucleo_sem_tipo(p_nucleo text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(p_nucleo, ''),
    '^((condominio|cond|residencial|resid|res|conjunto|conj|cj|edificio|ed|loteamento|lot|vila|parque|pq) )+', '')
$$;

create or replace function public.fn_bairro_pelo_endereco(p_texto text)
returns table (bairro text, lugar text, tipo text, ocorrencias integer, confirmado boolean, fonte text)
language sql stable security definer set search_path = public as $$
  with pedacos as (
    select distinct p.nucleo, fn_nucleo_sem_tipo(p.nucleo) curto
    from fn_pedacos_do_endereco(p_texto) p where fn_pedaco_util_sao_luis(p.nucleo)
  )
  select distinct on (l.id) l.bairro, l.nome, l.tipo, l.ocorrencias, l.confirmado, l.fonte
  from sao_luis_lugares l
  join pedacos p on p.nucleo = l.nucleo
     or (length(p.curto) >= 6 and p.curto = fn_nucleo_sem_tipo(l.nucleo))
     -- "Belleville" acha "Condomínio Belleville Residence" (começo do nome, 8+ letras)
     or (length(p.curto) >= 8 and fn_nucleo_sem_tipo(l.nucleo) like p.curto || ' %')
     or (length(fn_nucleo_sem_tipo(l.nucleo)) >= 8 and p.curto like fn_nucleo_sem_tipo(l.nucleo) || ' %')
     or (length(l.nucleo) >= 8 and coalesce(fn_distancia_grafia(p.curto, fn_nucleo_sem_tipo(l.nucleo)), 99) <= 1)
  where l.ocorrencias > 0 or l.confirmado
  order by l.id, l.confirmado desc, l.ocorrencias desc
$$;
revoke all on function public.fn_bairro_pelo_endereco(text) from public, anon;
grant execute on function public.fn_bairro_pelo_endereco(text) to authenticated;
