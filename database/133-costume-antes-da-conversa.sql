-- 133-costume-antes-da-conversa.sql — etapa 2 do bot autônomo (issue #504)
--
-- A prova do atendente de IA refaz conversas reais que já viraram reserva. O endereço de costume
-- tem de ser o de ANTES da conversa: com a reserva do próprio caso na conta, o "sentido sugerido"
-- e o local mais frequente entregariam a resposta e a prova sairia melhor do que é.
--
-- A regra passa para `fn_endereco_de_costume(p_customer_id, p_antes_de)`: só conta reserva e endereço
-- fixado pela equipe criados antes de `p_antes_de` (null = todos, como sempre). `rpc_endereco_de_costume`
-- fica com a mesma assinatura e chama a nova sem data: app, bot, revisor e assistente não mudam.
-- Sem `drop` (a assinatura antiga continua), para não haver duas funções com o mesmo nome.

create or replace function public.fn_endereco_de_costume(p_customer_id uuid, p_antes_de timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb := jsonb_build_object('success', true, 'ida', null, 'volta', null);
  v_dir trip_direction; v_man record; v_rep record; v_last_dir trip_direction;
begin
  if auth.uid() is not null and not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  foreach v_dir in array array['ida', 'volta']::trip_direction[] loop
    -- 1) o que a equipe fixou
    select h.route_point_code, rp.name as route_point_name, h.neighborhood, h.detail, h.dropoff_location, h.dropoff_area
      into v_man
      from customer_habitual_addresses h
      left join route_points rp on rp.code = h.route_point_code and rp.direction = h.direction and rp.deleted_at is null
     where h.customer_id = p_customer_id and h.direction = v_dir and h.deleted_at is null
       and (p_antes_de is null or h.created_at < p_antes_de);
    if found then
      v_res := jsonb_set(v_res, array[v_dir::text], jsonb_build_object('fonte', 'manual','route_point_code', v_man.route_point_code,'route_point_name', v_man.route_point_name,'neighborhood', v_man.neighborhood,'detail', v_man.detail,'dropoff_location', v_man.dropoff_location,'dropoff_area', v_man.dropoff_area));
      continue;
    end if;
    -- 2) histórico: local mais frequente (empate → o mais recente), com pelo menos 2 viagens no sentido
    with hist as (
      select rp.code as codigo, rp.name as nome, r.pickup_neighborhood as bairro, r.pickup_detail as detalhe,
             r.dropoff_location as desembarque, r.dropoff_area as area, t.trip_date as data, r.created_at as criado,
             fn_normalizar_local(concat_ws(' ', rp.code, r.pickup_neighborhood, r.pickup_detail)) as chave
        from reservations r join trips t on t.id = r.trip_id join route_points rp on rp.id = r.route_point_id
       where r.customer_id = p_customer_id and r.type = 'passagem' and r.deleted_at is null
         and r.status in ('confirmada', 'embarcado') and t.direction = v_dir
         and (p_antes_de is null or r.created_at < p_antes_de)
    ),
    grupos as (
      select chave, count(*) as vezes, max(data) as ult, max(criado) as cr from hist group by chave
       order by count(*) desc, max(data) desc, max(criado) desc limit 1
    )
    select (select count(*) from hist) as total, g.vezes, rep.*
      into v_rep
      from grupos g
      cross join lateral (select h.* from hist h where h.chave = g.chave order by h.data desc, h.criado desc limit 1) rep;
    if found and v_rep.total >= 2 then
      v_res := jsonb_set(v_res, array[v_dir::text], jsonb_build_object('fonte', 'historico','route_point_code', v_rep.codigo,'route_point_name', v_rep.nome,'neighborhood', nullif(btrim(v_rep.bairro), ''),'detail', nullif(btrim(v_rep.detalhe), ''),'dropoff_location', nullif(btrim(v_rep.desembarque), ''),'dropoff_area', nullif(btrim(v_rep.area), ''),'vezes', v_rep.vezes,'ultima_data', v_rep.data));
    end if;
  end loop;
  select t.direction into v_last_dir from reservations r join trips t on t.id = r.trip_id
   where r.customer_id = p_customer_id and r.type = 'passagem' and r.deleted_at is null and r.status in ('confirmada', 'embarcado')
     and (p_antes_de is null or r.created_at < p_antes_de)
   order by t.trip_date desc, r.created_at desc limit 1;
  v_res := v_res || jsonb_build_object('sentido_sugerido', case v_last_dir when 'ida' then 'volta' when 'volta' then 'ida' else null end);
  return v_res;
end;
$$;

revoke execute on function public.fn_endereco_de_costume(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_endereco_de_costume(uuid, timestamptz) to service_role;

create or replace function public.rpc_endereco_de_costume(p_customer_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.fn_endereco_de_costume(p_customer_id, null);
$$;
