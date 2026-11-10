-- =====================================================================
-- ROTA PIRAPEMAS — 79: GRAFIA ERRADA SÓ CORRIGE PARA O MESMO TIPO (#276)
-- =====================================================================
-- Rodar depois de 01–78. Idempotente.
-- Na 78, uma referência de uma palavra só ("campo", "igreja", "pracinha") era
-- corrigida para uma RUA parecida ("Rua do Campo", "Rua da Igreja", "Rua da
-- Prainha"). Palavra solta agora só se corrige para um lugar do mesmo tipo
-- (referência → referência, rua → rua); com 2+ palavras ("muacir andrade",
-- "choparia do riba") a correção vale entre tipos, como antes.
-- =====================================================================

drop function if exists public.fn_lugar_parecido(text);

create or replace function public.fn_lugar_parecido(p_nucleo text, p_tipo text)
returns text language plpgsql stable set search_path = public as $$
declare
  achado text;
  melhor record;
  segundo record;
  -- quantas palavras de verdade (sem da/de/do) o pedaço tem
  palavras int := (select count(*) from unnest(regexp_split_to_array(p_nucleo, ' ')) x
                   where x <> '' and x not in ('da', 'de', 'do', 'das', 'dos'));
begin
  select l.nucleo into achado
  from cidade_lugares_grafias g join cidade_lugares l on l.id = g.lugar_id
  where g.grafia = p_nucleo and (palavras >= 2 or l.tipo = p_tipo)
  order by g.vezes desc limit 1;
  if achado is not null then return achado; end if;

  select * into melhor from (
    select l.nucleo, fn_distancia_grafia(p_nucleo, l.nucleo) erros, sum(l.ocorrencias) n
    from cidade_lugares l
    where extensions.similarity(l.nucleo, p_nucleo) > 0.2 and (palavras >= 2 or l.tipo = p_tipo)
    group by l.nucleo
  ) z where z.erros is not null order by z.erros, z.n desc limit 1;
  if melhor.nucleo is null then return null; end if;
  select * into segundo from (
    select l.nucleo, fn_distancia_grafia(p_nucleo, l.nucleo) erros
    from cidade_lugares l
    where extensions.similarity(l.nucleo, p_nucleo) > 0.2 and l.nucleo <> melhor.nucleo
      and (palavras >= 2 or l.tipo = p_tipo)
    group by l.nucleo
  ) z where z.erros = melhor.erros limit 1;
  if segundo.nucleo is not null then return null; end if; -- dois lugares igualmente parecidos: não chuta
  return melhor.nucleo;
end $$;

create or replace function public.fn_lugares_citados(p_texto text)
returns table (tipo text, nucleo text, escrito text) language sql stable set search_path = public as $$
  with pedacos as (
    select p.tipo, p.nucleo, p.escrito,
           case when p.escrito is null and not exists (select 1 from cidade_lugares l where l.nucleo = p.nucleo)
                then fn_lugar_parecido(p.nucleo, p.tipo) end corrigido
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

-- reaprende o histórico com a regra nova
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
