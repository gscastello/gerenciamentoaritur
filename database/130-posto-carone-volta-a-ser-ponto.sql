-- 130-posto-carone-volta-a-ser-ponto.sql — issue #486
--
-- O dono preferiu (22/11) que o Posto Carone volte a ser uma categoria de embarque própria, com o
-- horário dele (05:40; na segunda a Ida sai 1 h mais cedo = 04:40), editável como os outros pontos.
-- Ele tinha sido juntado a Outros em database/73 (#261), e lá a mensagem dizia o horário de Outros
-- (05:30 na segunda). Isto:
--   1) reativa o ponto `postocarone` (o mesmo de antes; nada foi apagado);
--   2) desfaz a database/129 (horário por local de Outros), que fica sem uso: tira o Posto Carone
--      dos locais de Outros, a coluna `horario` e volta a função de gravar ao formato de antes;
--   3) as reservas FUTURAS em Outros no Posto Carone passam ao ponto (mesmo valor).

update route_points set active = true, deleted_at = null, base_time = '05:40', updated_at = now()
 where direction = 'ida' and code = 'postocarone';

delete from boarding_spot_prices where fn_normalizar_local(local) = fn_normalizar_local('Posto Carone');
alter table public.boarding_spot_prices drop column if exists horario;
alter table public.boarding_spot_prices alter column price set not null;

drop function if exists public.rpc_upsert_boarding_spot_price(text, numeric, time);
create or replace function public.rpc_upsert_boarding_spot_price(p_local text, p_price numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if length(btrim(coalesce(p_local, ''))) < 3 then
    return jsonb_build_object('success', false, 'message', 'Informe o local de embarque.');
  end if;
  if fn_normalizar_local(p_local) ~ '(^| )retorno( |$)' then
    return jsonb_build_object('success', false,
      'message', 'O Retorno é um ponto próprio, com o preço dele: não cadastre aqui.');
  end if;
  if p_price is null or p_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero.');
  end if;

  insert into boarding_spot_prices (local, price, created_by, updated_by)
  values (btrim(p_local), p_price, auth.uid(), auth.uid())
  on conflict (fn_normalizar_local(local)) do update
    set price = excluded.price, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$function$;
revoke all on function public.rpc_upsert_boarding_spot_price(text, numeric) from public, anon;
grant execute on function public.rpc_upsert_boarding_spot_price(text, numeric) to authenticated;

-- 3) reservas futuras em Outros no Posto Carone → ponto Posto Carone (mesmo valor; auditado)
do $$
declare
  v_ponto uuid := (select id from route_points where direction = 'ida' and code = 'postocarone');
begin
  update reservations res set route_point_id = v_ponto, pickup_detail = null, updated_at = now()
    from trips t, route_points rp
   where t.id = res.trip_id and rp.id = res.route_point_id and res.deleted_at is null
     and res.status in ('confirmada', 'pendente', 'espera')
     and t.direction = 'ida' and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
     and rp.code = 'outro' and res.pickup_detail ~* '^\s*posto\s+(do\s+)?carone\s*$';
end $$;
