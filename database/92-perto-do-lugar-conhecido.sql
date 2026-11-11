-- =====================================================================
-- ROTA PIRAPEMAS — 92: "DESCIDA DA INÊS" NO MEIO DA FRASE (#301)
-- =====================================================================
-- Rodar depois de 01–91. Idempotente.
-- Na frase crua do cliente ("Na descida da Inês uma casa com jardim…") o lugar
-- conhecido "Descida da Inês" é achado dentro do texto, mas a Inês (o lugar de
-- perto, com muito mais reservas) não entrava junto. Agora o lugar de perto
-- vale também para os lugares conhecidos achados no meio do texto.
-- =====================================================================

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
  ),
  fortes as (
    select l.tipo, l.nucleo from cidade_lugares l
    where fn_nucleo_forte(l.nucleo)
      and (' ' || fn_normalizar_local(p_texto) || ' ') like ('% ' || l.nucleo || ' %')
      -- "Beco do Hospital" não é a "Rua do Hospital": nome de rua logo depois de outro tipo de logradouro não vale
      and not (l.tipo = 'rua' and (' ' || fn_normalizar_local(p_texto) || ' ')
               ~ ('(beco|travessa|trav|tv|ladeira|estrada|estr|praca|pca|vila|alameda|rodovia|passagem|conjunto|residencial|condominio|povoado) ' || l.nucleo || ' '))
  )
  select distinct on (t.nucleo) t.tipo, t.nucleo, t.escrito from (
    select b.tipo, b.nucleo, b.escrito from base b
    union all
    -- "descida da ines" também é a "ines" (descida/subida só dizem a posição)
    select l.tipo, l.nucleo, null from (select nucleo from base union select nucleo from fortes) q
    join cidade_lugares l on l.nucleo = fn_sem_qualificador(q.nucleo)
    where fn_sem_qualificador(q.nucleo) <> q.nucleo
    union all
    select f.tipo, f.nucleo, null from fortes f
  ) t
  order by t.nucleo, (t.tipo = 'rua') desc, (t.escrito is null) desc
$$;

do $$
begin
  if exists (select 1 from cidade_lugares where nucleo = 'ines')
     and not exists (select 1 from fn_lugares_citados('Na descida da Inês uma casa com jardim na frente') c where c.nucleo = 'ines') then
    raise exception 'frase com descida da Inês não achou a Inês';
  end if;
  if exists (select 1 from fn_lugares_citados('Beco do Hospital, casa 3') c where c.nucleo in ('do hospital', 'hospital')) then
    raise exception 'Beco do Hospital virou Rua do Hospital ou Hospital';
  end if;
end $$;
