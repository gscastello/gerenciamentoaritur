-- =====================================================================
-- TESTES (pgTAP) — Job de diagnóstico de reservas (Issue #9)
-- =====================================================================
-- Como rodar:
--   supabase test db   (roda supabase/tests/database/*.sql numa transação
--                        revertida) — ou colar no SQL Editor: o arquivo
--                        abre BEGIN e fecha com ROLLBACK, nunca grava.
--
-- Cobre: fn_reservation_diagnostics_findings (sem_telefone, sem_viagem,
--        ponto_invalido) e fn_run_reservation_diagnostics (enfileira +
--        dedup 24h).
-- =====================================================================

begin;
select plan(6);

-- massa isolada (prefixo b0.. só deste arquivo)
insert into vehicles (id, name, plate, type, capacity, is_default, active)
values ('b0000000-0000-0000-0000-000000000001', 'TESTE diag', 'DIA-1000', 'onibus', 10, false, true);

insert into trips (id, trip_date, direction, vehicle_id, capacity, status)
values ('b0000000-0000-0000-0000-000000000002', '2099-07-01', 'ida', 'b0000000-0000-0000-0000-000000000001', 10, 'agendada');

-- um ponto de embarque válido e um removido
insert into route_points (id, direction, code, name, base_time, active)
values ('b0000000-0000-0000-0000-00000000000a', 'ida', 'diag-ok', 'Ponto OK', '06:00', true);
insert into route_points (id, direction, code, name, base_time, active, deleted_at)
values ('b0000000-0000-0000-0000-00000000000b', 'ida', 'diag-ghost', 'Ponto Fantasma', '06:00', false, now());

insert into customers (id, name, phone) values ('b0000000-0000-0000-0000-000000000003', 'Cliente Sem Fone', '');
insert into customers (id, name, phone) values ('b0000000-0000-0000-0000-000000000004', 'Cliente Com Fone', '5599000000001');

-- #5: cliente SEM telefone, viagem e ponto OK, 1 passageiro -> só 'sem_telefone'
insert into reservations (id, trip_id, customer_id, type, status, route_point_id, quantity, unit_price, total_price)
values ('b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000003', 'passagem', 'confirmada',
        'b0000000-0000-0000-0000-00000000000a', 1, 60, 60);
insert into reservation_passengers (reservation_id, seq, status)
values ('b0000000-0000-0000-0000-000000000005', 1, 'confirmado');

-- #8: cliente OK, viagem OK, ponto REMOVIDO, 1 passageiro -> só 'ponto_invalido'
insert into reservations (id, trip_id, customer_id, type, status, route_point_id, quantity, unit_price, total_price)
values ('b0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000004', 'passagem', 'confirmada',
        'b0000000-0000-0000-0000-00000000000b', 1, 60, 60);
insert into reservation_passengers (reservation_id, seq, status)
values ('b0000000-0000-0000-0000-000000000008', 1, 'confirmado');

-- #6: passagem confirmada SEM viagem (dado corrompido) -> 'sem_viagem'
insert into reservations (id, trip_id, customer_id, type, status, route_point_id, quantity, unit_price, total_price)
values ('b0000000-0000-0000-0000-000000000006', null,
        'b0000000-0000-0000-0000-000000000004', 'passagem', 'confirmada',
        'b0000000-0000-0000-0000-00000000000a', 1, 60, 60);

select ok(
  exists(select 1 from fn_reservation_diagnostics_findings()
         where kind = 'sem_telefone' and reservation_id = 'b0000000-0000-0000-0000-000000000005'),
  'sem_telefone: reserva ativa de cliente sem telefone é detectada'
);

select is(
  (select array_agg(kind order by kind)::text
     from fn_reservation_diagnostics_findings()
     where reservation_id = 'b0000000-0000-0000-0000-000000000005'),
  '{sem_telefone}',
  'sem falso-positivo: reserva bem-formada só aparece no achado que se aplica'
);

select ok(
  exists(select 1 from fn_reservation_diagnostics_findings()
         where kind = 'ponto_invalido' and reservation_id = 'b0000000-0000-0000-0000-000000000008'),
  'ponto_invalido: reserva apontando para route_point removido é detectada'
);

select ok(
  exists(select 1 from fn_reservation_diagnostics_findings()
         where kind = 'sem_viagem' and reservation_id = 'b0000000-0000-0000-0000-000000000006'),
  'sem_viagem: passagem confirmada sem trip_id é detectada'
);

-- orquestrador enfileira os achados
select fn_run_reservation_diagnostics();

select ok(
  exists(select 1 from notifications
         where template_key = 'alerta_diagnostico_reserva'
           and reservation_id = 'b0000000-0000-0000-0000-000000000005'
           and payload->>'kind' = 'sem_telefone'),
  'fn_run_reservation_diagnostics: enfileira alerta do achado sem_telefone'
);

-- rodar de novo NÃO duplica (dedup 24h)
select fn_run_reservation_diagnostics();

select is(
  (select count(*)::int from notifications
     where template_key = 'alerta_diagnostico_reserva'
       and reservation_id = 'b0000000-0000-0000-0000-000000000005'
       and payload->>'kind' = 'sem_telefone'),
  1,
  'dedup 24h: rodar de novo não duplica o mesmo alerta'
);

select * from finish();
rollback;
