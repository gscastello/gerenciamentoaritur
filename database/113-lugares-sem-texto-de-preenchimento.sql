-- 113 — A memória de lugares não aprende texto de preenchimento (issue #419)
--
-- As bases que aprendem com as reservas (sao_luis_lugares: lugar → bairro; cidade_lugares: lugar →
-- Pirapemas/Cantanhede) guardavam "Bairro A Confirmar", "Endereço a confirmar", "Referência" e
-- "Buscar em casa no Araçagy" como se fossem lugares. Depois, qualquer reserva com "bairro a
-- confirmar" no endereço era jogada no Turu (avaliação com casos reais: dois erros de bairro).

create or replace function public.fn_lugar_de_preenchimento(p_nucleo text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_nucleo, '') ~ '(a confirmar|buscar em casa|busca em casa|nao informad|sem endereco|nao sei)'
      or coalesce(p_nucleo, '') ~ '^(em casa|casa|referencia|ponto de referencia|endereco|bairro|rua|confirmar|centro da cidade)$'
$$;

create or replace function public.fn_pedaco_util_sao_luis(p_nucleo text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select length(coalesce(p_nucleo, '')) >= 4
     and p_nucleo !~ '^\d'
     and p_nucleo !~ '^(quadra|qd|bloco|bl|apartamento|apto|ap|casa|cs|lote|lt|numero|n|km|perto|proximo|frente|lado|esquina|fundo|fundos)( |$)'
     and not fn_lugar_de_preenchimento(p_nucleo)
$function$;

create or replace function public.fn_aprender_lugares_da_reserva(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- "Endereço a confirmar", "Referência": não é lugar (issue #419)
    continue when fn_lugar_de_preenchimento(c.nucleo);
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
end $function$;

-- limpa o que já foi aprendido (só da base aprendida; reserva nenhuma é tocada)
delete from sao_luis_lugares_vistas v using sao_luis_lugares l
 where v.lugar_id = l.id and fn_lugar_de_preenchimento(l.nucleo);
delete from sao_luis_lugares where fn_lugar_de_preenchimento(nucleo) and not confirmado;
delete from cidade_lugares_grafias g using cidade_lugares l
 where g.lugar_id = l.id and fn_lugar_de_preenchimento(l.nucleo) and l.fonte = 'reservas';
delete from cidade_lugares_vistas v using cidade_lugares l
 where v.lugar_id = l.id and fn_lugar_de_preenchimento(l.nucleo) and l.fonte = 'reservas';
delete from cidade_lugares where fn_lugar_de_preenchimento(nucleo) and fonte = 'reservas';

do $$
begin
  if exists (select 1 from sao_luis_lugares where fn_lugar_de_preenchimento(nucleo) and not confirmado)
     or exists (select 1 from cidade_lugares where fn_lugar_de_preenchimento(nucleo) and fonte = 'reservas') then
    raise exception '113: ainda há texto de preenchimento nas bases de lugares';
  end if;
end $$;
