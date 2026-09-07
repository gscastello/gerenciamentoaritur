-- =====================================================================
-- ROTA PIRAPEMAS — 20: JOB DE DIAGNÓSTICO DE RESERVAS
-- =====================================================================
-- Issue #9 / AGENTS.md §7. Porta a lógica de `runDiagnostics`
-- (frontend/src/domain/diagnostics.js) para um job no banco:
--
--   - roda de 6 em 6h (pg_cron) e também sob demanda pela aba Sistema
--     (`rpc_run_reservation_diagnostics`, só admin);
--   - CHECA (read-only) e enfileira cada achado em `notifications`
--     (channel='whatsapp', template_key='alerta_diagnostico_reserva'),
--     visíveis em `v_diagnostico_reservas`, com dedup de 24h, e loga um
--     resumo com `raise warning` (um log drain pode encaminhar pro
--     Sentry/Datadog — AGENTS.md §7).
--
-- SEM auto-correção: a única correção que o frontend fazia (quantity → 1)
-- já é garantida no banco pela trigger `trg_sync_quantity`
-- (`fn_sync_reservation_quantity`, 01-schema.sql), que mantém
-- `reservations.quantity` sempre igual à contagem de passageiros ativos.
-- Overbooking, ponto removido, telefone ausente etc. não têm correção
-- segura — só alerta (mesma regra do AGENTS.md §7). O achado
-- `quantidade_dessincronizada`, se aparecer, indica adulteração direta da
-- coluna (fora da trigger) e é reportado para conferência manual.
--
-- Rodar depois de 01-19. Idempotente (create or replace + cron upsert).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Achados (read-only). Uma linha por problema encontrado.
--    `kind`:
--      overbooking             — viagem futura com passageiros > capacidade
--      ponto_invalido          — passagem sem ponto ou com ponto removido
--      sem_telefone            — reserva ativa cujo cliente não tem telefone
--      quantidade_dessincronizada — quantity != nº de passageiros ativos
--      sem_viagem              — passagem confirmada/embarcada sem trip_id
--      pagamento_ausente       — passagem confirmada há +1 dia sem payment
-- ---------------------------------------------------------------------
-- security invoker: quando a view v_diagnostico_reservas chama esta função,
-- a RLS de reservations/trips/customers filtra pelo papel de quem consulta
-- (admin/atendente/financeiro veem tudo). O cron roda como service_role,
-- que já ignora RLS.
create or replace function public.fn_reservation_diagnostics_findings()
returns table (kind text, reservation_id uuid, trip_id uuid, detail jsonb)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  -- overbooking: uma linha por viagem estourada (reservation_id nulo)
  select 'overbooking'::text, null::uuid, o.trip_id,
         jsonb_build_object('trip_date', o.trip_date, 'direction', o.direction,
                            'occupied', o.occupied, 'capacity', o.capacity)
  from v_trip_occupancy o
  join trips t on t.id = o.trip_id
  where o.occupied > o.capacity
    and t.trip_date >= current_date

  union all
  -- ponto de embarque inexistente / removido (só passagem, reserva ativa)
  select 'ponto_invalido', r.id, r.trip_id,
         jsonb_build_object('route_point_id', r.route_point_id)
  from reservations r
  left join route_points rp on rp.id = r.route_point_id
  where r.deleted_at is null
    and r.type = 'passagem'
    and r.status in ('confirmada', 'embarcado')
    and (r.route_point_id is null or rp.id is null or rp.deleted_at is not null or rp.active = false)

  union all
  -- reserva ativa sem telefone de contato
  select 'sem_telefone', r.id, r.trip_id,
         jsonb_build_object('customer_id', c.id, 'customer_name', c.name)
  from reservations r
  join customers c on c.id = r.customer_id
  where r.deleted_at is null
    and r.status in ('confirmada', 'embarcado', 'pendente', 'espera')
    and (c.phone is null or btrim(c.phone) = '')

  union all
  -- quantity fora de sincronia com os passageiros ativos (adulteração)
  select 'quantidade_dessincronizada', r.id, r.trip_id,
         jsonb_build_object('quantity', r.quantity, 'passageiros_ativos', pax.n)
  from reservations r
  join lateral (
    select count(*)::int as n
    from reservation_passengers p
    where p.reservation_id = r.id and p.status <> 'cancelado'
  ) pax on true
  where r.deleted_at is null
    and r.type = 'passagem'
    and r.status in ('confirmada', 'embarcado')
    and r.quantity <> pax.n

  union all
  -- passagem confirmada/embarcada sem viagem associada
  select 'sem_viagem', r.id, null::uuid,
         jsonb_build_object('status', r.status, 'created_at', r.created_at)
  from reservations r
  where r.deleted_at is null
    and r.type = 'passagem'
    and r.status in ('confirmada', 'embarcado')
    and r.trip_id is null

  union all
  -- passagem confirmada há mais de 1 dia sem nenhum registro de pagamento
  select 'pagamento_ausente', r.id, r.trip_id,
         jsonb_build_object('created_at', r.created_at, 'total_price', r.total_price)
  from reservations r
  where r.deleted_at is null
    and r.type = 'passagem'
    and r.status = 'confirmada'
    and r.created_at < now() - interval '1 day'
    and not exists (
      select 1 from payments p
      where p.reservation_id = r.id and p.deleted_at is null
    );
$$;

revoke execute on function public.fn_reservation_diagnostics_findings() from public, anon;
grant  execute on function public.fn_reservation_diagnostics_findings() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) View de leitura ao vivo dos achados — respeita a RLS de quem
--    consulta (admin/atendente/financeiro). Igual a
--    v_pending_internal_alerts (14-financial-alerts.sql).
-- ---------------------------------------------------------------------
create or replace view public.v_diagnostico_reservas
with (security_invoker = true)
as
select kind, reservation_id, trip_id, detail
from public.fn_reservation_diagnostics_findings();

comment on view public.v_diagnostico_reservas is
  'Achados atuais do diagnóstico de reservas (issue #9). Só leitura.';

-- ---------------------------------------------------------------------
-- 3) Orquestrador: enfileira os achados como alerta interno (dedup 24h
--    por kind+reserva/viagem) e loga um resumo.
-- ---------------------------------------------------------------------
create or replace function public.fn_run_reservation_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_new_alerts  int := 0;
  v_por_tipo    jsonb;
begin
  with achados as (
    select * from public.fn_reservation_diagnostics_findings()
  ),
  inseridos as (
    insert into notifications (reservation_id, trip_id, channel, template_key, payload, status)
    select a.reservation_id, a.trip_id, 'whatsapp', 'alerta_diagnostico_reserva',
           a.detail || jsonb_build_object('kind', a.kind), 'pendente'
    from achados a
    where not exists (
      select 1 from notifications n
      where n.template_key = 'alerta_diagnostico_reserva'
        and n.payload ->> 'kind' = a.kind
        and n.reservation_id is not distinct from a.reservation_id
        and n.trip_id is not distinct from a.trip_id
        and n.created_at > now() - interval '24 hours'
    )
    returning 1
  )
  select count(*) into v_new_alerts from inseridos;

  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) into v_por_tipo
  from (select kind, count(*) c from public.fn_reservation_diagnostics_findings() group by kind) s;

  -- resumo: entra na fila (visível no painel) e no log do Postgres
  insert into notifications (channel, template_key, payload, status)
  values ('whatsapp', 'diagnostico_resumo',
          jsonb_build_object('novos_alertas', v_new_alerts, 'por_tipo', v_por_tipo, 'rodado_em', now()),
          'pendente');

  if v_new_alerts > 0 then
    raise warning 'diagnostico.reservas: % novo(s) alerta(s), por_tipo=%', v_new_alerts, v_por_tipo;
  end if;

  return jsonb_build_object('success', true, 'novos_alertas', v_new_alerts, 'por_tipo', v_por_tipo);
end;
$$;

revoke execute on function public.fn_run_reservation_diagnostics() from public, anon, authenticated;
grant  execute on function public.fn_run_reservation_diagnostics() to service_role;

-- ---------------------------------------------------------------------
-- 4) "Rodar agora" pela aba Sistema — só admin.
-- ---------------------------------------------------------------------
create or replace function public.rpc_run_reservation_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  return public.fn_run_reservation_diagnostics();
end;
$$;

revoke execute on function public.rpc_run_reservation_diagnostics() from public, anon;
grant  execute on function public.rpc_run_reservation_diagnostics() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) Agendamento — de 6 em 6h, aos 15 min (fora dos horários redondos
--    do fechamento de caixa / backup / custos recorrentes).
-- ---------------------------------------------------------------------
select cron.schedule(
  'run-reservation-diagnostics',
  '15 */6 * * *',
  $cron$ select public.fn_run_reservation_diagnostics(); $cron$
);

-- Conferir:  select * from cron.job where jobname = 'run-reservation-diagnostics';
--            select * from v_diagnostico_reservas;
--            select payload from notifications where template_key = 'diagnostico_resumo' order by created_at desc limit 5;
