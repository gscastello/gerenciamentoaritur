-- =====================================================================
-- ROTA PIRAPEMAS — ROW LEVEL SECURITY (RLS)
-- =====================================================================
-- Papéis (users.role): 'admin' | 'atendente' | 'motorista' | 'financeiro'
--
-- Regras gerais:
--   - admin:      acesso total a tudo.
--   - atendente:  cria/edita reservas, passageiros, clientes; lê viagens,
--                 pontos, preços; NÃO mexe em financeiro nem em folha de
--                 manutenção; não apaga fisicamente nada (soft delete).
--   - motorista:  só enxerga as viagens em que é o motorista designado;
--                 registra embarque/desembarque/ocorrências dessas viagens;
--                 não vê dados financeiros nem edita preços/configuração.
--   - financeiro: leitura ampla de reservas/viagens para conferência,
--                 leitura e escrita total em payments, financial_entries,
--                 fuel_records, maintenance; não edita o conteúdo da reserva
--                 em si (isso é papel do atendente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function fn_current_role() returns user_role
  language sql stable security definer set search_path = public, pg_temp as $$
  select role from users where id = auth.uid() and deleted_at is null
$$;

create or replace function fn_current_driver_id() returns uuid
  language sql stable security definer set search_path = public, pg_temp as $$
  select driver_id from users where id = auth.uid() and deleted_at is null
$$;

create or replace function fn_has_role(roles user_role[]) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select fn_current_role() = any(roles)
$$;

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
alter table users enable row level security;

-- Uma policy por ação (evita "multiple permissive policies" no SELECT) e
-- auth.uid()/fn_has_role() dentro de (select ...) para serem avaliados uma
-- vez por query, não por linha (advisor 0003_auth_rls_initplan).
create policy users_select on users for select
  using (
    id = (select auth.uid())
    or (select fn_has_role(array['admin']::user_role[]))
  );

create policy users_admin_insert on users for insert
  with check ((select fn_has_role(array['admin']::user_role[])));

create policy users_admin_update on users for update
  using      ((select fn_has_role(array['admin']::user_role[])))
  with check ((select fn_has_role(array['admin']::user_role[])));

create policy users_admin_delete on users for delete
  using ((select fn_has_role(array['admin']::user_role[])));

-- ---------------------------------------------------------------------
-- CUSTOMERS  — admin/atendente/financeiro leem e editam; motorista só lê
-- (campos mínimos, mas RLS não filtra coluna — se precisar mascarar campo,
-- criar uma view "customers_driver_safe" para o app do motorista consumir)
-- ---------------------------------------------------------------------
alter table customers enable row level security;

create policy customers_select on customers for select
  using (fn_has_role(array['admin','atendente','financeiro','motorista']::user_role[]) and deleted_at is null);

create policy customers_write on customers for insert
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy customers_update on customers for update
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

-- ---------------------------------------------------------------------
-- DRIVERS / VEHICLES  — leitura geral, escrita só admin
-- ---------------------------------------------------------------------
alter table drivers enable row level security;
create policy drivers_select on drivers for select using (deleted_at is null);
create policy drivers_admin_write on drivers for insert with check (fn_has_role(array['admin']::user_role[]));
create policy drivers_admin_update on drivers for update
  using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));

alter table vehicles enable row level security;
create policy vehicles_select on vehicles for select using (deleted_at is null);
create policy vehicles_admin_write on vehicles for insert with check (fn_has_role(array['admin']::user_role[]));
create policy vehicles_admin_update on vehicles for update
  using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));

-- ---------------------------------------------------------------------
-- ROUTE_POINTS / NEIGHBORHOOD_PRICING / SETTINGS — leitura geral (o bot e o
-- app precisam consultar preço/horário), escrita só admin
-- ---------------------------------------------------------------------
alter table route_points enable row level security;
create policy route_points_select on route_points for select using (deleted_at is null);
create policy route_points_admin_write on route_points for insert with check (fn_has_role(array['admin']::user_role[]));
create policy route_points_admin_update on route_points for update
  using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));

alter table neighborhood_pricing enable row level security;
create policy neighborhood_pricing_select on neighborhood_pricing for select using (true);
create policy neighborhood_pricing_admin_write on neighborhood_pricing for insert with check (fn_has_role(array['admin']::user_role[]));
create policy neighborhood_pricing_admin_update on neighborhood_pricing for update
  using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));

alter table settings enable row level security;
create policy settings_select on settings for select using (true);
create policy settings_admin_write on settings for all
  using (fn_has_role(array['admin']::user_role[])) with check (fn_has_role(array['admin']::user_role[]));

-- ---------------------------------------------------------------------
-- TRIPS  — admin vê tudo; atendente/financeiro veem tudo (leitura);
-- motorista só vê as viagens em que ele é o motorista designado
-- ---------------------------------------------------------------------
alter table trips enable row level security;

create policy trips_select on trips for select
  using (
    deleted_at is null and (
      fn_has_role(array['admin','atendente','financeiro']::user_role[])
      or (fn_current_role() = 'motorista' and driver_id = fn_current_driver_id())
    )
  );

create policy trips_write on trips for insert
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy trips_update_admin_atendente on trips for update
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

-- motorista pode atualizar SÓ os campos operacionais da própria viagem
-- (started_at, finished_at, km, localização) — controlado na aplicação/API,
-- a policy libera o update da linha, a trigger de auditoria registra quem mudou o quê.
create policy trips_update_motorista on trips for update
  using (fn_current_role() = 'motorista' and driver_id = fn_current_driver_id())
  with check (fn_current_role() = 'motorista' and driver_id = fn_current_driver_id());

-- ---------------------------------------------------------------------
-- RESERVATIONS  — admin/atendente leem e escrevem tudo; financeiro só lê;
-- motorista só lê as reservas das viagens dele (para saber quem embarca)
-- ---------------------------------------------------------------------
alter table reservations enable row level security;

create policy reservations_select on reservations for select
  using (
    deleted_at is null and (
      fn_has_role(array['admin','atendente','financeiro']::user_role[])
      or (fn_current_role() = 'motorista' and trip_id in (
            select id from trips where driver_id = fn_current_driver_id()
          ))
    )
  );

create policy reservations_write on reservations for insert
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy reservations_update on reservations for update
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

-- ---------------------------------------------------------------------
-- RESERVATION_PASSENGERS  — mesma regra de reservations, mas motorista
-- pode ATUALIZAR o status (embarcado / não compareceu) das viagens dele
-- ---------------------------------------------------------------------
alter table reservation_passengers enable row level security;

create policy res_passengers_select on reservation_passengers for select
  using (
    fn_has_role(array['admin','atendente','financeiro']::user_role[])
    or (fn_current_role() = 'motorista' and reservation_id in (
          select r.id from reservations r join trips t on t.id = r.trip_id
          where t.driver_id = fn_current_driver_id()
        ))
  );

create policy res_passengers_write on reservation_passengers for insert
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy res_passengers_update_atendente on reservation_passengers for update
  using (fn_has_role(array['admin','atendente']::user_role[]))
  with check (fn_has_role(array['admin','atendente']::user_role[]));

create policy res_passengers_update_motorista on reservation_passengers for update
  using (
    fn_current_role() = 'motorista' and reservation_id in (
      select r.id from reservations r join trips t on t.id = r.trip_id
      where t.driver_id = fn_current_driver_id()
    )
  )
  with check (
    fn_current_role() = 'motorista' and reservation_id in (
      select r.id from reservations r join trips t on t.id = r.trip_id
      where t.driver_id = fn_current_driver_id()
    )
  );

-- ---------------------------------------------------------------------
-- BOARDING_RECORDS  — motorista insere para as próprias viagens;
-- admin/atendente/financeiro só leem (histórico)
-- ---------------------------------------------------------------------
alter table boarding_records enable row level security;

create policy boarding_select on boarding_records for select
  using (
    fn_has_role(array['admin','atendente','financeiro']::user_role[])
    or (fn_current_role() = 'motorista' and trip_id in (select id from trips where driver_id = fn_current_driver_id()))
  );

create policy boarding_insert on boarding_records for insert
  with check (
    fn_has_role(array['admin','atendente']::user_role[])
    or (fn_current_role() = 'motorista' and trip_id in (select id from trips where driver_id = fn_current_driver_id()))
  );

-- ---------------------------------------------------------------------
-- PAYMENTS  — financeiro/admin escrevem; atendente só lê e cria (registrar
-- que o cliente pagou em dinheiro na hora); motorista não acessa
-- ---------------------------------------------------------------------
alter table payments enable row level security;

create policy payments_select on payments for select
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]) and deleted_at is null);

create policy payments_insert on payments for insert
  with check (fn_has_role(array['admin','atendente','financeiro']::user_role[]));

create policy payments_update on payments for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

-- ---------------------------------------------------------------------
-- FINANCIAL_ENTRIES / FUEL_RECORDS / MAINTENANCE — domínio do financeiro;
-- admin tem acesso total; atendente e motorista NÃO acessam
-- (exceção: motorista pode INSERIR fuel_records/ocorrências da própria
-- viagem, útil para registrar abastecimento na estrada — mas não edita
-- lançamentos financeiros diretamente, isso é feito pela trigger automática)
-- ---------------------------------------------------------------------
alter table financial_entries enable row level security;
create policy financial_entries_select on financial_entries for select
  using (fn_has_role(array['admin','financeiro']::user_role[]) and deleted_at is null);
create policy financial_entries_write on financial_entries for insert
  with check (fn_has_role(array['admin','financeiro']::user_role[]));
create policy financial_entries_update on financial_entries for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

alter table fuel_records enable row level security;
create policy fuel_records_select on fuel_records for select
  using (fn_has_role(array['admin','financeiro']::user_role[]) and deleted_at is null);
create policy fuel_records_insert on fuel_records for insert
  with check (fn_has_role(array['admin','financeiro','motorista']::user_role[]));
create policy fuel_records_update on fuel_records for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

alter table maintenance enable row level security;
create policy maintenance_select on maintenance for select
  using (fn_has_role(array['admin','financeiro']::user_role[]) and deleted_at is null);
create policy maintenance_write on maintenance for insert
  with check (fn_has_role(array['admin','financeiro']::user_role[]));
create policy maintenance_update on maintenance for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

-- ---------------------------------------------------------------------
-- OPERATIONAL_OCCURRENCES — motorista registra nas próprias viagens;
-- admin/atendente leem tudo
-- ---------------------------------------------------------------------
alter table operational_occurrences enable row level security;
create policy occurrences_select on operational_occurrences for select
  using (
    fn_has_role(array['admin','atendente','financeiro']::user_role[])
    or (fn_current_role() = 'motorista' and trip_id in (select id from trips where driver_id = fn_current_driver_id()))
  );
create policy occurrences_insert on operational_occurrences for insert
  with check (
    fn_has_role(array['admin','atendente']::user_role[])
    or (fn_current_role() = 'motorista' and trip_id in (select id from trips where driver_id = fn_current_driver_id()))
  );

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — só admin/atendente/backend do bot (service role) escrevem;
-- leitura geral para acompanhamento
-- ---------------------------------------------------------------------
alter table notifications enable row level security;
create policy notifications_select on notifications for select
  using (fn_has_role(array['admin','atendente','financeiro']::user_role[]));
create policy notifications_insert on notifications for insert
  with check (fn_has_role(array['admin','atendente']::user_role[]));
-- o backend do bot do WhatsApp deve usar a service_role key do Supabase (que
-- ignora RLS por padrão) para inserir/atualizar notifications em lote.

-- ---------------------------------------------------------------------
-- AUDIT_LOGS — INSERT-ONLY. Ninguém faz update/delete (nem admin) pela API;
-- correções de dado errado são feitas com um NOVO registro de auditoria,
-- nunca reescrevendo o passado.
-- ---------------------------------------------------------------------
alter table audit_logs enable row level security;
create policy audit_select on audit_logs for select
  using (fn_has_role(array['admin','financeiro']::user_role[]));
create policy audit_insert on audit_logs for insert
  with check (true); -- as triggers gravam via security definer; ver nota abaixo
-- nenhuma policy de update/delete é criada — por padrão, sem policy, a
-- operação é negada com RLS habilitado.

-- =====================================================================
-- NOTA IMPORTANTE SOBRE O BOT DO WHATSAPP
-- =====================================================================
-- O backend que integra com a WhatsApp Business API deve se conectar ao
-- Supabase usando a "service_role key" (chave de servidor, nunca exposta
-- ao navegador), que ignora RLS. Isso é necessário porque o bot cria
-- reservas em nome de qualquer cliente, sem estar "logado" como um usuário
-- específico do quadro de funcionários. Toda escrita feita pelo bot deve
-- preencher created_by com um usuário de sistema dedicado (ex.: um registro
-- em "users" chamado "Bot WhatsApp", role 'atendente') para que a auditoria
-- diferencie claramente "feito pela IA" de "feito por humano".
