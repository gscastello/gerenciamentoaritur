-- =====================================================================
-- ROTA PIRAPEMAS — SCHEMA V3 (PostgreSQL / Supabase)
-- =====================================================================
-- Convenções gerais adotadas em TODAS as tabelas de domínio:
--   id            uuid primary key default gen_random_uuid()
--   created_at    timestamptz not null default now()
--   updated_at    timestamptz not null default now()   (mantido por trigger)
--   created_by    uuid references users(id)             (quem criou)
--   updated_by    uuid references users(id)              (quem alterou por último)
--   deleted_at    timestamptz                            (soft delete — nunca DELETE físico)
-- Toda consulta de aplicação deve filtrar "where deleted_at is null"
-- (as policies de RLS já fazem isso por padrão — ver supabase-rls-policies.sql).
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- e-mail/telefone case-insensitive

-- =====================================================================
-- 1. ENUMS
-- =====================================================================
create type user_role            as enum ('admin', 'atendente', 'motorista', 'financeiro');
create type trip_direction       as enum ('ida', 'volta');
create type trip_status          as enum ('agendada', 'em_andamento', 'concluida', 'cancelada');
create type reservation_type     as enum ('passagem', 'frete', 'encomenda');
create type reservation_status   as enum ('pendente', 'confirmada', 'embarcado', 'cancelada', 'nao_compareceu', 'espera');
create type passenger_status     as enum ('confirmado', 'embarcado', 'nao_compareceu', 'cancelado');
create type boarding_event_type  as enum ('embarque', 'desembarque', 'nao_compareceu');
create type payment_method       as enum ('dinheiro', 'pix');
create type payment_status       as enum ('pendente', 'pago', 'estornado');
create type financial_entry_type as enum ('receita', 'despesa');
create type occurrence_type      as enum ('atraso', 'pane', 'acidente', 'reclamacao', 'outro');
create type occurrence_severity  as enum ('baixa', 'media', 'alta');
create type notification_channel as enum ('whatsapp', 'sms', 'email');
create type notification_status  as enum ('pendente', 'enviada', 'falha');
create type vehicle_type         as enum ('onibus', 'van');
create type audit_action         as enum ('create', 'update', 'status_change', 'delete', 'restore');

-- =====================================================================
-- 2. FUNÇÕES DE APOIO (updated_at automático)
-- =====================================================================
create or replace function fn_set_updated_at() returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

-- =====================================================================
-- 3. USERS  (perfil de aplicação — 1:1 com auth.users do Supabase)
-- =====================================================================
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  phone         text,
  role          user_role not null default 'atendente',
  active        boolean not null default true,
  driver_id     uuid,                              -- preenchido se o usuário também é motorista (FK adicionada após drivers existir)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  deleted_at    timestamptz
);
create index idx_users_role on users (role) where deleted_at is null;
create trigger trg_users_updated_at before update on users
  for each row execute function fn_set_updated_at();

-- provisiona automaticamente uma linha em "users" quando alguém se cadastra no Supabase Auth
create or replace function fn_handle_new_auth_user() returns trigger as $$
begin
  insert into users (id, name, role) values (NEW.id, coalesce(NEW.raw_user_meta_data->>'name', NEW.email), 'atendente');
  return NEW;
end;
$$ language plpgsql security definer;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_auth_user();

-- =====================================================================
-- 4. CUSTOMERS  (passageiros / CRM)
-- =====================================================================
create table customers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text not null,
  email               citext,
  default_neighborhood text,                       -- último bairro usado (agiliza próxima reserva)
  notes               text,                        -- notas de CRM
  tags                jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references users(id),
  updated_by          uuid references users(id),
  deleted_at          timestamptz
);
create unique index uq_customers_phone on customers (phone) where deleted_at is null;
create index idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create trigger trg_customers_updated_at before update on customers
  for each row execute function fn_set_updated_at();
-- (requer a extensão pg_trgm para o índice de busca por nome; ver rodapé "extensões opcionais")

-- =====================================================================
-- 5. DRIVERS  (motoristas)
-- =====================================================================
create table drivers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  license_number        text,
  license_category      text,
  license_expires_at    date,
  user_id               uuid references users(id),  -- se o motorista tem login no app
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references users(id),
  updated_by            uuid references users(id),
  deleted_at            timestamptz
);
create index idx_drivers_active on drivers (active) where deleted_at is null;
alter table users add constraint fk_users_driver foreign key (driver_id) references drivers(id);
create trigger trg_drivers_updated_at before update on drivers
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 6. VEHICLES  (veículos)
-- =====================================================================
create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  plate         text not null,
  type          vehicle_type not null,
  capacity      integer not null check (capacity > 0),
  is_default    boolean not null default false,     -- ônibus = padrão
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  deleted_at    timestamptz
);
create unique index uq_vehicles_plate on vehicles (plate) where deleted_at is null;
-- garante no máximo 1 veículo "padrão" ativo por vez
create unique index uq_vehicles_single_default on vehicles (is_default) where is_default and deleted_at is null;
create trigger trg_vehicles_updated_at before update on vehicles
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 7. ROUTE_POINTS  (pontos de embarque/desembarque configuráveis — substitui o TRIPS_PADRAO fixo no frontend)
-- =====================================================================
create table route_points (
  id                uuid primary key default gen_random_uuid(),
  direction         trip_direction not null,
  code              text not null,               -- 'busca' | 'rodoviaria' | 'retorno' | 'postocarone' | 'br' | 'outro' | 'pirapemas' | 'cantanhede' | custom-*
  name              text not null,
  base_time         time not null,
  price             numeric(10,2),               -- null = precificado por bairro (ver neighborhood_pricing)
  requires_detail   boolean not null default false,
  detail_label      text,
  boarding_window   text,                        -- ex.: "12:00 – 13:00" (Volta)
  is_core           boolean not null default false, -- pontos que a UI não deixa remover
  display_order     integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references users(id),
  updated_by        uuid references users(id),
  deleted_at        timestamptz
);
create unique index uq_route_points_dir_code on route_points (direction, code) where deleted_at is null;
create index idx_route_points_direction on route_points (direction) where deleted_at is null;
create trigger trg_route_points_updated_at before update on route_points
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 8. NEIGHBORHOOD_PRICING  (precificação de "Buscar em Casa" por bairro)
-- =====================================================================
create table neighborhood_pricing (
  id            uuid primary key default gen_random_uuid(),
  neighborhood  citext not null,
  price         numeric(10,2) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id)
);
create unique index uq_neighborhood_pricing_name on neighborhood_pricing (neighborhood);
create trigger trg_neighborhood_pricing_updated_at before update on neighborhood_pricing
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 9. SETTINGS  (configuração-chave/valor: ajuste de segunda, Pix, modo de atendimento etc.)
-- =====================================================================
create table settings (
  key           text primary key,
  value         jsonb not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id)
);
create trigger trg_settings_updated_at before update on settings
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 10. TRIPS  (uma "viagem" = Ida ou Volta de um dia específico — capacidade É CONGELADA aqui)
-- =====================================================================
create table trips (
  id                    uuid primary key default gen_random_uuid(),
  trip_date             date not null,
  direction             trip_direction not null,
  vehicle_id            uuid not null references vehicles(id),
  driver_id             uuid references drivers(id),
  capacity              integer not null check (capacity > 0),   -- snapshot da capacidade do veículo no momento da criação
  monday_adjusted       boolean not null default false,
  status                trip_status not null default 'agendada',
  started_at            timestamptz,
  start_location        text,
  start_km              numeric(10,1),
  finished_at           timestamptz,
  end_location           text,
  end_km                numeric(10,1),
  duration_min          integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references users(id),
  updated_by            uuid references users(id),
  deleted_at            timestamptz
);
create unique index uq_trips_date_direction on trips (trip_date, direction) where deleted_at is null;
create index idx_trips_date on trips (trip_date) where deleted_at is null;
create index idx_trips_status on trips (status) where deleted_at is null;
create index idx_trips_driver on trips (driver_id) where deleted_at is null;
create trigger trg_trips_updated_at before update on trips
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 11. RESERVATIONS  (cabeçalho da reserva — 1 reserva pode ter N passageiros)
-- =====================================================================
create table reservations (
  id                        uuid primary key default gen_random_uuid(),
  trip_id                   uuid references trips(id),          -- null para frete/encomenda ainda sem viagem definida
  customer_id               uuid not null references customers(id),
  type                      reservation_type not null default 'passagem',
  status                    reservation_status not null default 'confirmada',
  route_point_id            uuid references route_points(id),
  pickup_neighborhood       text,                                -- Buscar em Casa
  pickup_detail             text,                                -- BR / Outro local
  street                    text,                                -- Volta: rua
  reference_point           text,                                -- Volta: ponto de referência
  dropoff_location          text,
  quantity                  integer not null default 1 check (quantity > 0),  -- mantido em sincronia por trigger com reservation_passengers
  unit_price                numeric(10,2),
  total_price               numeric(10,2),
  payment_method            payment_method not null default 'dinheiro',
  pending_reason            text,
  extra_data                jsonb not null default '{}'::jsonb,  -- frete/encomenda: item, tipo, recebedor etc.
  whatsapp_source_message_id text,                                -- idempotência do webhook do bot
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references users(id),
  updated_by                uuid references users(id),
  deleted_at                timestamptz
);
create unique index uq_reservations_wa_message on reservations (whatsapp_source_message_id) where whatsapp_source_message_id is not null;
create index idx_reservations_trip on reservations (trip_id) where deleted_at is null;
create index idx_reservations_customer on reservations (customer_id) where deleted_at is null;
create index idx_reservations_status on reservations (status) where deleted_at is null;
create index idx_reservations_type on reservations (type) where deleted_at is null;
create trigger trg_reservations_updated_at before update on reservations
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 12. RESERVATION_PASSENGERS  (um registro por lugar/passageiro dentro da reserva)
-- =====================================================================
create table reservation_passengers (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references reservations(id) on delete cascade,
  seq             integer not null default 1,
  passenger_name  text,                                          -- se null, usa o nome do customer
  status          passenger_status not null default 'confirmado',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id),
  updated_by      uuid references users(id)
);
create index idx_res_passengers_reservation on reservation_passengers (reservation_id);
create index idx_res_passengers_status on reservation_passengers (status);
create trigger trg_res_passengers_updated_at before update on reservation_passengers
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 13. BOARDING_RECORDS  (eventos de embarque/desembarque/no-show — log imutável)
-- =====================================================================
create table boarding_records (
  id                        uuid primary key default gen_random_uuid(),
  reservation_passenger_id  uuid not null references reservation_passengers(id),
  trip_id                   uuid not null references trips(id),   -- denormalizado para consulta rápida por viagem
  event_type                boarding_event_type not null,
  event_at                  timestamptz not null default now(),
  recorded_by               uuid references users(id),
  location                  text,
  created_at                timestamptz not null default now()
);
create index idx_boarding_trip on boarding_records (trip_id);
create index idx_boarding_passenger on boarding_records (reservation_passenger_id);

-- =====================================================================
-- 14. PAYMENTS  (pagamentos — fonte de verdade sobre "pago"/comprovante)
-- =====================================================================
create table payments (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references reservations(id),
  amount          numeric(10,2) not null,
  method          payment_method not null,
  status          payment_status not null default 'pendente',
  paid_at         timestamptz,
  proof_url       text,                                          -- comprovante real (upload) em produção
  proof_received  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id),
  updated_by      uuid references users(id),
  deleted_at      timestamptz
);
create index idx_payments_reservation on payments (reservation_id) where deleted_at is null;
create index idx_payments_status on payments (status) where deleted_at is null;
create trigger trg_payments_updated_at before update on payments
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 15. FUEL_RECORDS  (abastecimento por VEÍCULO — corrige mistura ônibus/van do V2)
-- =====================================================================
create table fuel_records (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id),
  trip_id       uuid references trips(id),
  record_date   date not null,
  direction     trip_direction,
  km            numeric(10,1) not null,
  liters        numeric(10,2),
  cost          numeric(10,2) not null default 0,
  cost_per_km   numeric(10,4) generated always as (case when km > 0 then cost / km else 0 end) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  deleted_at    timestamptz
);
create index idx_fuel_vehicle_date on fuel_records (vehicle_id, record_date) where deleted_at is null;
create trigger trg_fuel_updated_at before update on fuel_records
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 16. MAINTENANCE  (manutenção preventiva por VEÍCULO, com histórico)
-- =====================================================================
create table maintenance (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id),
  type          text not null,                -- 'troca de óleo', 'pneus'...
  performed_at  date not null,
  odometer_km   numeric(10,1) not null,
  interval_km   numeric(10,1) not null,
  cost          numeric(10,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  deleted_at    timestamptz
);
create index idx_maintenance_vehicle on maintenance (vehicle_id) where deleted_at is null;
create trigger trg_maintenance_updated_at before update on maintenance
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 17. FINANCIAL_ENTRIES  (livro-caixa — receitas/despesas; combustível/manutenção entram AUTOMATICAMENTE via trigger,
--     nunca manualmente, eliminando o risco de dupla contagem identificado na auditoria V2)
-- =====================================================================
create table financial_entries (
  id                uuid primary key default gen_random_uuid(),
  entry_date        date not null,
  type              financial_entry_type not null,
  category          text,                          -- 'passagem' | 'combustivel' | 'manutencao' | 'outro'
  amount            numeric(10,2) not null,
  description       text,
  reservation_id    uuid references reservations(id),
  fuel_record_id    uuid references fuel_records(id),
  maintenance_id    uuid references maintenance(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references users(id),
  updated_by        uuid references users(id),
  deleted_at        timestamptz
);
create index idx_financial_entries_date on financial_entries (entry_date) where deleted_at is null;
create index idx_financial_entries_type on financial_entries (type) where deleted_at is null;
-- impede lançar duas vezes a mesma despesa de combustível/manutenção (corrige o bug B4 da auditoria)
create unique index uq_financial_entries_fuel on financial_entries (fuel_record_id) where fuel_record_id is not null and deleted_at is null;
create unique index uq_financial_entries_maint on financial_entries (maintenance_id) where maintenance_id is not null and deleted_at is null;
create trigger trg_financial_entries_updated_at before update on financial_entries
  for each row execute function fn_set_updated_at();

-- gera automaticamente o lançamento de despesa quando um abastecimento/manutenção é criado
create or replace function fn_fuel_to_financial_entry() returns trigger as $$
begin
  insert into financial_entries (entry_date, type, category, amount, description, fuel_record_id, created_by)
  values (NEW.record_date, 'despesa', 'combustivel', NEW.cost, 'Abastecimento — ' || NEW.km || ' km', NEW.id, NEW.created_by);
  return NEW;
end;
$$ language plpgsql;
create trigger trg_fuel_financial_entry after insert on fuel_records
  for each row execute function fn_fuel_to_financial_entry();

create or replace function fn_maintenance_to_financial_entry() returns trigger as $$
begin
  insert into financial_entries (entry_date, type, category, amount, description, maintenance_id, created_by)
  values (NEW.performed_at, 'despesa', 'manutencao', NEW.cost, NEW.type, NEW.id, NEW.created_by);
  return NEW;
end;
$$ language plpgsql;
create trigger trg_maintenance_financial_entry after insert on maintenance
  for each row execute function fn_maintenance_to_financial_entry();

-- =====================================================================
-- 18. OPERATIONAL_OCCURRENCES  (ocorrências operacionais: atraso, pane, reclamação...)
-- =====================================================================
create table operational_occurrences (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid references trips(id),
  vehicle_id    uuid references vehicles(id),
  type          occurrence_type not null,
  severity      occurrence_severity not null default 'baixa',
  description   text not null,
  occurred_at   timestamptz not null default now(),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  deleted_at    timestamptz
);
create index idx_occurrences_trip on operational_occurrences (trip_id) where deleted_at is null;
create trigger trg_occurrences_updated_at before update on operational_occurrences
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 19. NOTIFICATIONS  (fila/log de mensagens — WhatsApp Business API em produção)
-- =====================================================================
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id),
  reservation_id  uuid references reservations(id),
  trip_id         uuid references trips(id),
  channel         notification_channel not null default 'whatsapp',
  template_key    text not null,                 -- 'reserva_confirmada' | 'viagem_a_caminho' | 'janela_busca' ...
  payload         jsonb not null default '{}'::jsonb,
  status          notification_status not null default 'pendente',
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_notifications_status on notifications (status);
create index idx_notifications_trip on notifications (trip_id);
create trigger trg_notifications_updated_at before update on notifications
  for each row execute function fn_set_updated_at();

-- =====================================================================
-- 20. AUDIT_LOGS  (auditoria real — somente inserção, substitui o campo "historico" solto do V2)
-- =====================================================================
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  entity_table    text not null,
  entity_id       uuid not null,
  action          audit_action not null,
  before_data     jsonb,
  after_data      jsonb,
  performed_by    uuid references users(id),
  performed_at    timestamptz not null default now()
);
create index idx_audit_entity on audit_logs (entity_table, entity_id);
create index idx_audit_performed_by on audit_logs (performed_by);
create index idx_audit_performed_at on audit_logs (performed_at);
-- audit_logs é INSERT-ONLY: sem trigger de updated_at, e a RLS (ver arquivo de políticas) bloqueia update/delete para todos os papéis.

-- =====================================================================
-- 21. TRIGGER GENÉRICO DE AUDITORIA (aplicado às tabelas mais sensíveis)
-- =====================================================================
create or replace function fn_audit_trigger() returns trigger as $$
declare
  v_action audit_action;
  v_actor uuid;
begin
  v_actor := coalesce(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by);
  if TG_OP = 'INSERT' then v_action := 'create';
  elsif TG_OP = 'UPDATE' then
    if (to_jsonb(OLD)->>'status') is distinct from (to_jsonb(NEW)->>'status') then v_action := 'status_change';
    else v_action := 'update'; end if;
  elsif TG_OP = 'DELETE' then v_action := 'delete';
  end if;

  insert into audit_logs (entity_table, entity_id, action, before_data, after_data, performed_by)
  values (TG_TABLE_NAME, coalesce(NEW.id, OLD.id), v_action,
          case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
          case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
          v_actor);
  return coalesce(NEW, OLD);
end;
$$ language plpgsql;

create trigger trg_audit_reservations after insert or update on reservations
  for each row execute function fn_audit_trigger();
create trigger trg_audit_reservation_passengers after insert or update on reservation_passengers
  for each row execute function fn_audit_trigger();
create trigger trg_audit_payments after insert or update on payments
  for each row execute function fn_audit_trigger();
create trigger trg_audit_trips after insert or update on trips
  for each row execute function fn_audit_trigger();
create trigger trg_audit_financial_entries after insert or update on financial_entries
  for each row execute function fn_audit_trigger();

-- =====================================================================
-- 22. ANTI-OVERBOOKING NO NÍVEL DO BANCO (não depende do frontend)
-- =====================================================================
-- Estratégia: ao inserir/alterar um reservation_passenger para status que OCUPA vaga
-- ('confirmado' | 'embarcado'), a trigger:
--   1) TRAVA a linha de trips (SELECT ... FOR UPDATE) — serializa qualquer concorrência
--      na MESMA viagem, mesmo com dois clientes reservando ao mesmo tempo.
--   2) conta quantos lugares já estão ocupados nessa viagem.
--   3) se ultrapassar a capacidade (congelada em trips.capacity), a transação inteira
--      é revertida (raise exception) — a reserva NUNCA é gravada acima da lotação.
create or replace function fn_check_trip_capacity() returns trigger as $$
declare
  v_trip_id  uuid;
  v_capacity int;
  v_occupied int;
begin
  select r.trip_id into v_trip_id from reservations r where r.id = NEW.reservation_id;

  if v_trip_id is null then
    return NEW;  -- frete/encomenda ou reserva ainda sem viagem definida: não entra na checagem de lotação
  end if;

  -- trava a linha da viagem: qualquer outra transação tentando inserir passageiro
  -- nesta mesma viagem espera aqui até esta transação terminar (commit ou rollback)
  select capacity into v_capacity from trips where id = v_trip_id for update;
  if v_capacity is null then
    raise exception 'Viagem % não encontrada para checagem de capacidade', v_trip_id;
  end if;

  if NEW.status in ('confirmado', 'embarcado') then
    select count(*) into v_occupied
      from reservation_passengers rp
      join reservations r2 on r2.id = rp.reservation_id
      where r2.trip_id = v_trip_id
        and rp.status in ('confirmado', 'embarcado')
        and rp.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_occupied + 1 > v_capacity then
      raise exception 'CAPACIDADE_EXCEDIDA: viagem % já tem % de % lugares ocupados'
        , v_trip_id, v_occupied, v_capacity
        using errcode = 'P0001', hint = 'Ofereça lista de espera ao cliente.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger trg_capacity_check
  before insert or update of status, reservation_id on reservation_passengers
  for each row execute function fn_check_trip_capacity();

-- mantém reservations.quantity sempre sincronizado com a contagem real de passageiros
create or replace function fn_sync_reservation_quantity() returns trigger as $$
begin
  update reservations
    set quantity = greatest(1, (
      select count(*) from reservation_passengers
      where reservation_id = coalesce(NEW.reservation_id, OLD.reservation_id)
        and status <> 'cancelado'
    ))
    where id = coalesce(NEW.reservation_id, OLD.reservation_id);
  return null;
end;
$$ language plpgsql;

create trigger trg_sync_quantity
  after insert or update or delete on reservation_passengers
  for each row execute function fn_sync_reservation_quantity();

-- =====================================================================
-- 23. VIEW DE APOIO — ocupação em tempo real por viagem (usada pelo backend
--     ANTES de tentar inserir, para responder rápido ao bot/app sem esperar
--     o erro da trigger; a trigger continua sendo a garantia final)
-- =====================================================================
create or replace view v_trip_occupancy as
select
  t.id as trip_id,
  t.trip_date,
  t.direction,
  t.capacity,
  coalesce(sum(case when rp.status in ('confirmado','embarcado') then 1 else 0 end), 0) as occupied,
  t.capacity - coalesce(sum(case when rp.status in ('confirmado','embarcado') then 1 else 0 end), 0) as available,
  coalesce(sum(case when rp.status = 'embarcado' then 1 else 0 end), 0) as boarded
from trips t
left join reservations r on r.trip_id = t.id and r.deleted_at is null
left join reservation_passengers rp on rp.reservation_id = r.id
where t.deleted_at is null
group by t.id;

-- =====================================================================
-- EXTENSÕES OPCIONAIS (para busca de clientes por nome com acentos/erros de digitação)
-- =====================================================================
-- create extension if not exists pg_trgm;   -- necessária para o índice gin usado em customers.name acima
