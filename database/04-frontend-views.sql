-- =====================================================================
-- ROTA PIRAPEMAS — VIEW DE LEITURA PARA O FRONTEND
-- =====================================================================
-- Objetivo: o frontend atual foi construído em cima de um objeto de
-- reserva "achatado" (id, data, direcao, pontoId, quantidade, nome,
-- telefone, status, valorTotal...). Em vez de reescrever toda a UI para
-- o modelo normalizado (reservations + reservation_passengers +
-- customers + route_points), criamos esta view de LEITURA que devolve
-- exatamente esse formato — reservationsService.list() consulta ela.
-- Escritas continuam indo para as tabelas normalizadas via RPC (ver
-- supabase-rpc-functions.sql), nunca direto nesta view.
-- =====================================================================

create or replace view v_reservations_flat as
select
  r.id,
  t.trip_date                    as data,
  r.trip_id,
  coalesce(t.direction, null)    as direcao,
  rp.code                        as "pontoId",
  r.pickup_neighborhood          as bairro,
  r.pickup_detail                as "localExato",
  r.street                       as rua,
  r.reference_point               as referencia,
  r.dropoff_location              as desembarque,
  r.quantity                     as quantidade,
  r.unit_price                    as "valorUnit",
  r.total_price                   as "valorTotal",
  r.payment_method                as pagamento,
  r.status,
  r.type                          as tipo,
  r.pending_reason                as "motivoPendente",
  r.extra_data                    as extra,
  c.id                             as customer_id,
  c.name                           as nome,
  c.phone                          as telefone,
  exists (
    select 1 from payments p where p.reservation_id = r.id and p.status = 'pago' and p.deleted_at is null
  ) as pago,
  exists (
    select 1 from payments p where p.reservation_id = r.id and p.proof_received and p.deleted_at is null
  ) as "comprovanteRecebido",
  (
    select bool_or(rp2.status = 'embarcado')
    from reservation_passengers rp2 where rp2.reservation_id = r.id
  ) as "temEmbarcado",
  r.created_at                    as "criadoEm",
  r.updated_at                    as "atualizadoEm"
from reservations r
left join trips t on t.id = r.trip_id
left join route_points rp on rp.id = r.route_point_id
join customers c on c.id = r.customer_id
where r.deleted_at is null;

comment on view v_reservations_flat is
  'Projeção de leitura para o frontend — mantém o formato de objeto que a UI já consome. Nunca usar para escrita; escritas passam pelas funções RPC.';
