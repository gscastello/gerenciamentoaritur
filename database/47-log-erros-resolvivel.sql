-- database/47-log-erros-resolvivel.sql
--
-- Log de erros ganha "resolver" (pedido do dono, 2026-09-20): hoje é só
-- leitura, sem jeito de marcar um erro como já visto/tratado. Sem RPC —
-- é só um UPDATE guardado por RLS, igual ao resto do app.

alter table public.app_error_log
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.users(id);

drop policy if exists app_error_log_admin_update on public.app_error_log;
create policy app_error_log_admin_update on public.app_error_log
  for update
  using (fn_has_role(array['admin']::user_role[]))
  with check (fn_has_role(array['admin']::user_role[]));

grant update on public.app_error_log to authenticated;

-- Diagnóstico de reservas ganha trip_date (pedido do dono, mesma
-- entrega): o achado já trazia reservation_id/trip_id, mas não a data
-- da viagem — sem ela não dá pra montar um link "ver reserva" direto
-- pra Agenda (que navega por data, não por id).
create or replace view public.v_diagnostico_reservas
with (security_invoker = true) as
select f.kind, f.reservation_id, f.trip_id, f.detail, t.trip_date
from fn_reservation_diagnostics_findings() f
left join trips t on t.id = f.trip_id;

grant select on public.v_diagnostico_reservas to authenticated, service_role;
