-- =====================================================================
-- ROTA PIRAPEMAS — 35: ÍNDICES DE DESEMPENHO
-- =====================================================================
-- Hoje a base é pequena e o planner faz seq scan (é o certo). Estes
-- índices são para quando os volumes crescerem — cobrem os caminhos que
-- as telas mais usam:
--   - listas de reserva ordenam por created_at (v_reservations_flat)
--   - Agenda filtra reservas por viagem + status
--   - a trigger de capacidade conta passageiros por reserva + status
--   - o Financeiro varre lançamentos por período + tipo
--   - o CRM varre o histórico de reservas por cliente
--
-- Rodar depois de 01-34. Idempotente (if not exists).
-- =====================================================================

-- v_reservations_flat: order by r.created_at ("criadoEm")
create index if not exists idx_reservations_created
  on public.reservations (created_at)
  where deleted_at is null;

-- Agenda / Lista do Dia: reservas de uma viagem, por status;
-- também acelera o count da trigger de capacidade (join por trip_id).
create index if not exists idx_reservations_trip_status
  on public.reservations (trip_id, status)
  where deleted_at is null;

-- CRM / Passageiros: histórico de um cliente, mais recentes primeiro.
create index if not exists idx_reservations_customer_created
  on public.reservations (customer_id, created_at)
  where deleted_at is null;

-- fn_check_trip_capacity + subquery "temEmbarcado" da view: passageiros
-- de uma reserva por status.
create index if not exists idx_res_passengers_res_status
  on public.reservation_passengers (reservation_id, status);

-- Financeiro (mês/ano): lançamentos por período e tipo.
create index if not exists idx_financial_entries_date_type
  on public.financial_entries (entry_date, type)
  where deleted_at is null;

-- Chaves estrangeiras "quentes" sem índice (advisor 0001) — as demais
-- (created_by/updated_by → users) ficam de fora: users nunca é
-- deletado de verdade (só soft delete), então o índice seria só custo
-- de escrita.
create index if not exists idx_financial_entries_ajuste
  on public.financial_entries (entrada_ajustada_id)
  where entrada_ajustada_id is not null;
create index if not exists idx_app_notifications_reservation
  on public.app_notifications (reservation_id)
  where reservation_id is not null;
create index if not exists idx_support_tickets_customer
  on public.support_tickets (customer_id)
  where customer_id is not null;

analyze public.reservations;
analyze public.reservation_passengers;
analyze public.financial_entries;

-- Conferir uso depois de rodar em produção por um tempo:
--   select indexrelname, idx_scan from pg_stat_user_indexes
--   where relname in ('reservations','reservation_passengers','financial_entries')
--   order by idx_scan desc;
