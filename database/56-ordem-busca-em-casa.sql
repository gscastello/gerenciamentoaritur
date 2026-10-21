-- =====================================================================
-- ROTA PIRAPEMAS — 56: ordem e atribuição em lote da busca em casa (#198)
-- =====================================================================
-- Rodar depois de 01–55. Idempotente.
--   * reservations.pickup_seq: posição da reserva na lista "Buscar em casa"
--     do dia (o dono ordena para repassar aos taxistas). Nulo = sem ordem
--     definida (fica depois, na ordem de criação).
--   * rpc_reorder_pickup(p_ids): grava a ordem de uma vez.
--   * rpc_set_pickup_transport_many(p_ids, p_mode): define quem busca várias
--     reservas numa chamada só (táxi, Gustavo, Maurício ou Ari).
-- =====================================================================

alter table public.reservations add column if not exists pickup_seq integer;

-- A Agenda lê tudo de v_reservations_flat (select *): coluna nova só no fim.
create or replace view public.v_reservations_flat with (security_invoker = true) as
 SELECT r.id,
    t.trip_date AS data,
    r.trip_id,
    COALESCE(t.direction, NULL::trip_direction) AS direcao,
    rp.code AS "pontoId",
    r.pickup_neighborhood AS bairro,
    r.pickup_detail AS "localExato",
    r.street AS rua,
    r.reference_point AS referencia,
    r.dropoff_location AS desembarque,
    r.quantity AS quantidade,
    r.unit_price AS "valorUnit",
    r.total_price AS "valorTotal",
    r.payment_method AS pagamento,
    r.status,
    r.type AS tipo,
    r.pending_reason AS "motivoPendente",
    r.extra_data AS extra,
    c.id AS customer_id,
    c.name AS nome,
    c.phone AS telefone,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE p.reservation_id = r.id AND p.status = 'pago'::payment_status AND p.deleted_at IS NULL)) AS pago,
    (EXISTS ( SELECT 1
           FROM payments p
          WHERE p.reservation_id = r.id AND p.proof_received AND p.deleted_at IS NULL)) AS "comprovanteRecebido",
    ( SELECT bool_or(rp2.status = 'embarcado'::passenger_status) AS bool_or
           FROM reservation_passengers rp2
          WHERE rp2.reservation_id = r.id) AS "temEmbarcado",
    r.created_at AS "criadoEm",
    r.updated_at AS "atualizadoEm",
    r.dropoff_area AS "desembarqueArea",
    r.dropoff_detail AS "desembarqueDetalhe",
    r.dropoff_seq AS "desembarqueSeq",
    r.pickup_transport AS "buscaPor",
    c.phone_secondary AS telefone2,
    r.pickup_seq AS "buscaSeq"
   FROM reservations r
     LEFT JOIN trips t ON t.id = r.trip_id
     LEFT JOIN route_points rp ON rp.id = r.route_point_id
     JOIN customers c ON c.id = r.customer_id
  WHERE r.deleted_at IS NULL;

create or replace function public.rpc_reorder_pickup(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para reordenar.');
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('success', true, 'updated', 0);
  end if;

  update public.reservations r
     set pickup_seq = x.ord, updated_by = auth.uid()
    from unnest(p_ids) with ordinality as x(id, ord)
   where r.id = x.id and r.deleted_at is null;

  return jsonb_build_object('success', true, 'updated', array_length(p_ids, 1));
end;
$fn$;
revoke execute on function public.rpc_reorder_pickup(uuid[]) from public, anon;
grant  execute on function public.rpc_reorder_pickup(uuid[]) to authenticated, service_role;

create or replace function public.rpc_set_pickup_transport_many(p_ids uuid[], p_mode text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_n integer;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_mode is null or p_mode not in ('taxi', 'proprio', 'motorista', 'ari') then
    return jsonb_build_object('success', false, 'message', 'Modo inválido.');
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('success', true, 'updated', 0);
  end if;

  update reservations set pickup_transport = p_mode, updated_by = auth.uid()
   where id = any(p_ids) and deleted_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('success', true, 'mode', p_mode, 'updated', v_n);
end;
$fn$;
revoke execute on function public.rpc_set_pickup_transport_many(uuid[], text) from public, anon;
grant  execute on function public.rpc_set_pickup_transport_many(uuid[], text) to authenticated, service_role;

-- Conferir:
--   select public.rpc_set_pickup_transport_many(array['<uuid>']::uuid[], 'ari');
--   select nome, "buscaPor", "buscaSeq" from v_reservations_flat where "pontoId" = 'busca' order by "buscaSeq";
