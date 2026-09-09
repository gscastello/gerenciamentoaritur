-- =====================================================================
-- ROTA PIRAPEMAS — 29: QUEM BUSCA O PASSAGEIRO EM CASA (issue #96)
-- =====================================================================
-- "Buscar em Casa" em São Luís: por padrão um táxi parceiro busca; às
-- vezes o próprio escritório ('proprio') ou o motorista ('motorista').
-- Campo por reserva, editável na Lista do Dia com um toque.
--
-- Rodar depois de 01-28. Idempotente.
-- =====================================================================

alter table public.reservations
  add column if not exists pickup_transport text not null default 'taxi';

alter table public.reservations drop constraint if exists reservations_pickup_transport_check;
alter table public.reservations add constraint reservations_pickup_transport_check
  check (pickup_transport in ('taxi', 'proprio', 'motorista'));

-- ---------------------------------------------------------------------
-- v_reservations_flat: expõe como "buscaPor" (coluna nova no fim — o
-- CREATE OR REPLACE VIEW permite acrescentar ao final)
-- ---------------------------------------------------------------------
create or replace view public.v_reservations_flat as
 select r.id,
    t.trip_date as data,
    r.trip_id,
    coalesce(t.direction, null::trip_direction) as direcao,
    rp.code as "pontoId",
    r.pickup_neighborhood as bairro,
    r.pickup_detail as "localExato",
    r.street as rua,
    r.reference_point as referencia,
    r.dropoff_location as desembarque,
    r.quantity as quantidade,
    r.unit_price as "valorUnit",
    r.total_price as "valorTotal",
    r.payment_method as pagamento,
    r.status,
    r.type as tipo,
    r.pending_reason as "motivoPendente",
    r.extra_data as extra,
    c.id as customer_id,
    c.name as nome,
    c.phone as telefone,
    (exists ( select 1 from payments p
       where p.reservation_id = r.id and p.status = 'pago'::payment_status and p.deleted_at is null)) as pago,
    (exists ( select 1 from payments p
       where p.reservation_id = r.id and p.proof_received and p.deleted_at is null)) as "comprovanteRecebido",
    ( select bool_or(rp2.status = 'embarcado'::passenger_status) as bool_or
       from reservation_passengers rp2 where rp2.reservation_id = r.id) as "temEmbarcado",
    r.created_at as "criadoEm",
    r.updated_at as "atualizadoEm",
    r.dropoff_area as "desembarqueArea",
    r.dropoff_detail as "desembarqueDetalhe",
    r.dropoff_seq as "desembarqueSeq",
    r.pickup_transport as "buscaPor"
   from reservations r
     left join trips t on t.id = r.trip_id
     left join route_points rp on rp.id = r.route_point_id
     join customers c on c.id = r.customer_id
  where r.deleted_at is null;

-- ---------------------------------------------------------------------
-- RPC: define quem busca. admin/atendente despacham; o motorista também
-- pode (assume uma busca na estrada). Guarda no padrão da 28.
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_pickup_transport(p_reservation_id uuid, p_mode text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_mode is null or p_mode not in ('taxi', 'proprio', 'motorista') then
    return jsonb_build_object('success', false, 'message', 'Modo inválido.');
  end if;
  v_actor := auth.uid();

  update reservations set pickup_transport = p_mode, updated_by = v_actor
    where id = p_reservation_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  return jsonb_build_object('success', true, 'mode', p_mode);
end;
$fn$;
revoke execute on function public.rpc_set_pickup_transport(uuid, text) from public, anon;
grant  execute on function public.rpc_set_pickup_transport(uuid, text) to authenticated, service_role;

-- Conferir:
--   select public.rpc_set_pickup_transport('<uuid>', 'proprio');
--   select "pontoId", nome, "buscaPor" from v_reservations_flat where "pontoId" = 'busca';
