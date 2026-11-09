-- =====================================================================
-- ROTA PIRAPEMAS — 73: EMBARQUE "OUTROS" ABSORVE BR E POSTO CARONE (#261)
-- =====================================================================
-- Rodar depois de 01–72. Idempotente.
-- Decisão do dono (2026-11-09): na Ida só existem quatro categorias de
-- embarque — Buscar em Casa, Rodoviária, Retorno e Outros. Qualquer outro
-- local (BR, Posto Carone, aeroporto, beira da estrada…) é "Outros", com o
-- local que o cliente citou no detalhe (pickup_detail).
--
--  1) "Outro local de embarque" passa a se chamar "Outros" e herda o preço
--     do BR (R$ 60). Com R$ 0 a reserva nova nascia sem valor.
--  2) As reservas do BR e do Posto Carone (inclusive as antigas, para o
--     histórico aparecer na seção certa) passam para Outros, guardando o
--     local no detalhe: "BR — Maracanã", "Posto Carone".
--  3) Os pontos BR e Posto Carone são desativados (soft delete; nada some).
-- Trocar o ponto não mexe na viagem: a capacidade e o financeiro não mudam.
-- =====================================================================

do $$
declare
  v_outro  uuid;
  v_preco  numeric;
begin
  select id into v_outro from route_points
   where direction = 'ida' and code = 'outro' and deleted_at is null;
  if v_outro is null then
    raise exception 'Ponto "outro" da Ida não encontrado';
  end if;

  select price into v_preco from route_points
   where direction = 'ida' and code = 'br' and deleted_at is null;

  update route_points
     set name = 'Outros',
         price = coalesce(nullif(v_preco, 0), nullif(price, 0), 60),
         requires_detail = true,
         active = true
   where id = v_outro;

  -- BR: o detalhe já é o lugar na BR ("Maracanã", "Estiva"…)
  update reservations r
     set route_point_id = v_outro,
         pickup_detail = case
           when coalesce(btrim(r.pickup_detail), '') = '' then 'BR'
           when r.pickup_detail ~* '(^|[^a-z])br([^a-z]|$)' then r.pickup_detail
           else 'BR — ' || btrim(r.pickup_detail)
         end
    from route_points rp
   where rp.id = r.route_point_id and rp.direction = 'ida' and rp.code = 'br';

  -- Posto Carone: quase sempre sem detalhe
  update reservations r
     set route_point_id = v_outro,
         pickup_detail = case
           when coalesce(btrim(r.pickup_detail), '') = '' then 'Posto Carone'
           when r.pickup_detail ~* 'carone' or btrim(lower(r.pickup_detail)) = 'posto' then 'Posto Carone'
           else 'Posto Carone — ' || btrim(r.pickup_detail)
         end
    from route_points rp
   where rp.id = r.route_point_id and rp.direction = 'ida' and rp.code = 'postocarone';

  -- endereço de costume fixado nesses pontos vira Outros com o mesmo local
  update customer_habitual_addresses
     set route_point_code = 'outro',
         detail = case when route_point_code = 'br' then coalesce('BR — ' || nullif(btrim(detail), ''), 'BR')
                       else coalesce('Posto Carone — ' || nullif(btrim(detail), ''), 'Posto Carone') end
   where deleted_at is null and route_point_code in ('br', 'postocarone');

  update route_points
     set active = false, deleted_at = coalesce(deleted_at, now())
   where direction = 'ida' and code in ('br', 'postocarone');
end $$;
