-- =====================================================================
-- ROTA PIRAPEMAS — 10: Plano de desembarque (rota do motorista)
-- =====================================================================
-- Rodar depois de 01–05. A reserva já guarda o local de desembarque como
-- texto livre (dropoff_location). Para o motorista montar a rota de
-- entrega, acrescentamos 3 campos estruturados por reserva:
--   dropoff_area   — o "balde" da rota
--                    IDA:   cantanhede | pirapemas | outro
--                    VOLTA: br | retorno | rodoviaria | casa
--                    NULL  = ainda não classificado (a UI infere do texto)
--   dropoff_detail — bairro (casa), ponto de referência (br) ou descrição
--   dropoff_seq    — ordem manual de entrega dentro do balde (nulls por último)

alter table public.reservations
  add column if not exists dropoff_area   text,
  add column if not exists dropoff_detail text,
  add column if not exists dropoff_seq    integer;

comment on column public.reservations.dropoff_area   is 'Balde da rota de desembarque. IDA: cantanhede|pirapemas|outro. VOLTA: br|retorno|rodoviaria|casa. NULL = a UI infere do texto de dropoff_location.';
comment on column public.reservations.dropoff_detail is 'Bairro (casa) / ponto de referência (br) / descrição — o que o motorista precisa pra achar o endereço.';
comment on column public.reservations.dropoff_seq    is 'Ordem manual de entrega dentro do balde (nulls por último).';

-- ---------------------------------------------------------------------
-- View de leitura: os 3 campos entram NO FIM (create or replace view não
-- deixa inserir coluna no meio).
-- ---------------------------------------------------------------------
create or replace view v_reservations_flat with (security_invoker = on) as
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
  r.updated_at                    as "atualizadoEm",
  r.dropoff_area                  as "desembarqueArea",
  r.dropoff_detail                as "desembarqueDetalhe",
  r.dropoff_seq                   as "desembarqueSeq"
from reservations r
left join trips t on t.id = r.trip_id
left join route_points rp on rp.id = r.route_point_id
join customers c on c.id = r.customer_id
where r.deleted_at is null;

revoke all    on v_reservations_flat from anon;
grant  select on v_reservations_flat to authenticated;

-- ---------------------------------------------------------------------
-- Escrita de uma reserva (balde + detalhe). admin/atendente sempre;
-- motorista só nas reservas das viagens em que ele é o motorista
-- designado (para quando os motoristas tiverem login).
-- ---------------------------------------------------------------------
create or replace function public.rpc_set_dropoff(
  p_reservation_id uuid,
  p_area   text default null,
  p_detail text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_ok boolean;
begin
  select fn_has_role(array['admin','atendente']::user_role[])
      or (fn_current_role() = 'motorista' and exists (
            select 1 from reservations r join trips t on t.id = r.trip_id
            where r.id = p_reservation_id and t.driver_id = fn_current_driver_id()))
    into v_ok;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para editar o desembarque.');
  end if;

  update public.reservations
     set dropoff_area   = nullif(trim(p_area), ''),
         dropoff_detail = nullif(trim(p_detail), ''),
         updated_at     = now()
   where id = p_reservation_id and deleted_at is null;

  return jsonb_build_object('success', true);
end $$;

revoke execute on function public.rpc_set_dropoff(uuid, text, text) from public, anon;
grant  execute on function public.rpc_set_dropoff(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Reordenar: ids de um balde na ordem desejada -> dropoff_seq = posição.
-- ---------------------------------------------------------------------
create or replace function public.rpc_reorder_dropoff(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_ok boolean;
begin
  select fn_has_role(array['admin','atendente']::user_role[])
      or (fn_current_role() = 'motorista' and not exists (
            select 1 from reservations r
            left join trips t on t.id = r.trip_id
            where r.id = any(p_ids)
              and (t.driver_id is distinct from fn_current_driver_id())))
    into v_ok;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão para reordenar o desembarque.');
  end if;

  update public.reservations r
     set dropoff_seq = x.ord, updated_at = now()
    from unnest(p_ids) with ordinality as x(id, ord)
   where r.id = x.id and r.deleted_at is null;

  return jsonb_build_object('success', true);
end $$;

revoke execute on function public.rpc_reorder_dropoff(uuid[]) from public, anon;
grant  execute on function public.rpc_reorder_dropoff(uuid[]) to authenticated, service_role;
