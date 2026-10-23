-- =====================================================================
-- ROTA PIRAPEMAS — 59: lixeira de reservas canceladas / restaurar (#206)
-- =====================================================================
-- Rodar depois de 01–58. Idempotente.
-- Cancelar uma reserva sempre foi UPDATE status = 'cancelada' (nunca DELETE),
-- então as canceladas já estão todas no banco. Aqui:
--   1) guardamos QUANDO, POR QUEM e DE QUAL STATUS foi cancelada;
--   2) rpc_restore_reservation devolve a reserva ao estado de antes,
--      respeitando a lotação, e desfaz o estorno automático do financeiro e o
--      status 'estornado' do pagamento;
--   3) v_reservations_flat ganha canceladaEm / canceladaPor (colunas no fim)
--      — a Agenda monta a "Lixeira" com as canceladas que ela já carrega.
-- =====================================================================

alter table public.reservations
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references public.users(id),
  add column if not exists status_before_cancel public.reservation_status;

-- Já canceladas: usa a última atualização como "quando" (melhor estimativa).
update public.reservations
   set cancelled_at = coalesce(updated_at, created_at),
       cancelled_by = updated_by
 where status = 'cancelada' and cancelled_at is null;

create or replace function public.fn_reservation_track_cancel() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if NEW.status = 'cancelada' and OLD.status is distinct from 'cancelada' then
    NEW.cancelled_at := now();
    NEW.cancelled_by := NEW.updated_by;
    NEW.status_before_cancel := OLD.status;
  elsif OLD.status = 'cancelada' and NEW.status is distinct from 'cancelada' then
    NEW.cancelled_at := null;
    NEW.cancelled_by := null;
    NEW.status_before_cancel := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_reservation_track_cancel on public.reservations;
create trigger trg_reservation_track_cancel
  before update of status on public.reservations
  for each row execute function public.fn_reservation_track_cancel();

-- A Agenda lê tudo de v_reservations_flat (select *): colunas novas só no fim.
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
    r.pickup_seq AS "buscaSeq",
    r.cancelled_at AS "canceladaEm",
    ( SELECT u.name FROM users u WHERE u.id = r.cancelled_by) AS "canceladaPor"
   FROM reservations r
     LEFT JOIN trips t ON t.id = r.trip_id
     LEFT JOIN route_points rp ON rp.id = r.route_point_id
     JOIN customers c ON c.id = r.customer_id
  WHERE r.deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Restaurar: volta ao status de antes de cancelar (pendente/espera ficam
-- como estavam; o resto volta "confirmada"). Se a viagem já lotou, o gatilho
-- de capacidade recusa e NADA é alterado.
-- ---------------------------------------------------------------------
create or replace function public.rpc_restore_reservation(p_reservation_id uuid, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid;
  v_res   reservations%rowtype;
  v_alvo  reservation_status;
  v_dia   date;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  select * into v_res from reservations where id = p_reservation_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;
  if v_res.status <> 'cancelada' then
    return jsonb_build_object('success', false, 'message', 'Esta reserva não está cancelada.');
  end if;

  v_alvo := case when v_res.status_before_cancel in ('pendente', 'espera')
                 then v_res.status_before_cancel
                 else 'confirmada'::reservation_status end;

  -- só uma reserva "confirmada" ocupa vaga (o gatilho de lotação decide)
  if v_alvo = 'confirmada' then
    update reservation_passengers set status = 'confirmado', updated_by = v_actor
     where reservation_id = p_reservation_id and status = 'cancelado';
  end if;

  update reservations set status = v_alvo, updated_by = v_actor
   where id = p_reservation_id;

  if v_alvo = 'confirmada' then
    -- desfaz o estorno automático do cancelamento e o "estornado" do pagamento
    update financial_entries
       set deleted_at = now(), updated_by = v_actor
     where reservation_id = p_reservation_id
       and type = 'despesa' and category = 'estorno'
       and description like 'Estorno automático%'
       and deleted_at is null;

    update payments set status = 'pago', updated_by = v_actor
     where reservation_id = p_reservation_id and status = 'estornado' and deleted_at is null;

    -- dias passados já fechados com esse estorno: refaz o fechamento
    for v_dia in
      select distinct entry_date from financial_entries
       where reservation_id = p_reservation_id and category = 'estorno'
         and deleted_at is not null and entry_date < current_date
    loop
      if exists (select 1 from daily_closures where closure_date = v_dia) then
        perform fn_close_day(v_dia);
      end if;
    end loop;
  end if;

  return jsonb_build_object('success', true, 'status', v_alvo);

exception
  when sqlstate 'P0001' then
    return jsonb_build_object('success', false,
      'message', 'Não foi possível restaurar: ' || SQLERRM);
end;
$fn$;
revoke execute on function public.rpc_restore_reservation(uuid, uuid) from public, anon;
grant  execute on function public.rpc_restore_reservation(uuid, uuid) to authenticated, service_role;

-- Conferir:
--   select nome, "canceladaEm", "canceladaPor" from v_reservations_flat where status = 'cancelada' order by "canceladaEm" desc;
--   select public.rpc_restore_reservation('<uuid>');
