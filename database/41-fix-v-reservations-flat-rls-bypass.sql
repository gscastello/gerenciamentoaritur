-- =====================================================================
-- ROTA PIRAPEMAS — 41: CORRIGE VAZAMENTO DE RLS EM v_reservations_flat
-- =====================================================================
-- Achado na auditoria pré-uso-real (2026-09-19, advisor de segurança do
-- Supabase, nível ERROR "Security Definer View"): toda VIEW do Postgres
-- roda com o privilégio de quem CRIOU (o dono), não de quem consulta,
-- a menos que seja marcada security_invoker — isso vale mesmo sem
-- ninguém pedir "SECURITY DEFINER" explicitamente, é o padrão histórico
-- do Postgres. `v_reservations_flat` (fonte de dados de TODA tela de
-- reserva — Agenda, Lista do Dia, Passageiros, busca) tinha esse
-- comportamento, o que ignorava por completo a política de RLS de
-- `reservations_select`: um motorista deveria ver só as reservas das
-- viagens em que ele é o motorista (`trip_id in (... driver_id =
-- fn_current_driver_id())`), mas a view bypassava isso e mostrava TODAS
-- as reservas da empresa — nome, telefone, valor, tudo — pra qualquer
-- motorista autenticado. Com mais de 1 motorista cadastrado isso vira
-- vazamento real de dado de cliente entre equipes de viagens diferentes.
--
-- Corrige com `security_invoker = true` (suportado desde Postgres 15,
-- confirmado Postgres 17 no projeto) — a forma recomendada pelo próprio
-- linter do Supabase. A partir daqui a view respeita a RLS de quem
-- consulta: admin/atendente/financeiro continuam vendo tudo (a política
-- já permitia), motorista passa a ver só as reservas das viagens dele.
--
-- Efeito colateral que essa correção descobriu: `payments_select` NUNCA
-- permitia motorista ver pagamentos (nem os das próprias viagens) — a
-- view antiga escondia isso porque ignorava RLS também nessa subconsulta
-- (`pago`/`comprovanteRecebido` sempre resolviam certo, sem checar
-- permissão). Sem esse ajuste, depois da correção acima, TODO passageiro
-- apareceria como "a receber" pro motorista mesmo já pago — regressão
-- real na tela do motorista (ele usa isso pra saber se cobra na hora do
-- embarque). Estende `payments_select` pro motorista ver pagamentos das
-- reservas das próprias viagens, espelhando exatamente o padrão já usado
-- em `reservations_select`/`trips_select`.
--
-- Também revoga grants de UPDATE/INSERT na view que estavam soltos pra
-- `authenticated` (inofensivos na prática — a view tem JOIN e não é
-- "simple updatable view", sem trigger INSTEAD OF — mas violam o
-- desenho do projeto de que toda escrita passa por RPC; ver
-- database/12-write-guards.sql).
--
-- Rodar depois de 01-40. Idempotente.
-- =====================================================================

alter view public.v_reservations_flat set (security_invoker = true);

revoke insert, update, delete, truncate, trigger, references on public.v_reservations_flat from authenticated;
grant select on public.v_reservations_flat to authenticated;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  to authenticated
  using (
    (fn_has_role(array['admin','atendente','financeiro']::user_role[]) and deleted_at is null)
    or (
      fn_current_role() = 'motorista'::user_role
      and deleted_at is null
      and reservation_id in (
        select r.id from public.reservations r
        join public.trips t on t.id = r.trip_id
        where t.driver_id = fn_current_driver_id()
      )
    )
  );

-- Conferir (como motorista, via app ou trocando o JWT de teste):
--   select count(*) from v_reservations_flat; -- só as viagens dele
--   select pago, "comprovanteRecebido" from v_reservations_flat limit 5; -- valores corretos, não tudo false
