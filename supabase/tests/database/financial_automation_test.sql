-- =====================================================================
-- TESTES (pgTAP) — Automação financeira (7 soluções) + regressão Issue #14
-- =====================================================================
-- Como rodar:
--   supabase test db          (convenção do Supabase CLI, roda tudo em
--                               supabase/tests/database/*.sql dentro de
--                               uma transação revertida automaticamente)
--   ou, manualmente, colar este arquivo inteiro no SQL Editor — ele
--   mesmo abre BEGIN e fecha com ROLLBACK, então nunca grava dado real.
--
-- Rodado e comprovado passando (11/11) em produção via Supabase MCP em
-- 2026-09-03, dentro de uma transação revertida.
-- =====================================================================

begin;
select plan(11);

-- ---------------------------------------------------------------------
-- Massa de dados de teste (isolada por prefixo de UUID só deste arquivo)
-- ---------------------------------------------------------------------
insert into vehicles (id, name, plate, type, capacity, is_default, active)
values ('a0000000-0000-0000-0000-000000000001', 'TESTE onibus', 'TST-1000', 'onibus', 2, false, true);

insert into trips (id, trip_date, direction, vehicle_id, capacity, status)
values ('a0000000-0000-0000-0000-000000000002', '2099-06-01', 'ida', 'a0000000-0000-0000-0000-000000000001', 2, 'agendada');

insert into customers (id, name, phone)
values ('a0000000-0000-0000-0000-000000000003', 'Cliente Teste PGTAP', '00000000010');

-- =====================================================================
-- Solução 1 — reserva de passagem cria payment pendente sozinha
-- =====================================================================
insert into reservations (id, trip_id, customer_id, type, status, quantity, unit_price, total_price, payment_method)
values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'passagem', 'confirmada', 1, 60, 60, 'pix');

-- garante que a reserva realmente ocupa vaga (necessário para o teste
-- de regressão da Issue #14, mais abaixo)
insert into reservation_passengers (reservation_id, seq, status)
values ('a0000000-0000-0000-0000-000000000004', 1, 'confirmado');

select ok(
  exists(select 1 from payments where reservation_id = 'a0000000-0000-0000-0000-000000000004' and status = 'pendente' and amount = 60),
  'Solução 1: reserva de passagem cria payment pendente de R$60 sozinha'
);

-- =====================================================================
-- Sincronização — mudar total_price da reserva atualiza o payment pendente
-- =====================================================================
update reservations set total_price = 120 where id = 'a0000000-0000-0000-0000-000000000004';

select is(
  (select amount from payments where reservation_id = 'a0000000-0000-0000-0000-000000000004' and status = 'pendente'),
  120::numeric,
  'Sincronização: mudar total_price da reserva atualiza o valor do payment pendente'
);

-- =====================================================================
-- Solução 2 — marcar payment como pago gera receita sozinha, sem duplicar
-- =====================================================================
-- paid_at fixo em 2099-06-01 para o lançamento cair no mesmo dia do
-- fechamento testado logo abaixo (valida a cadeia completa 2 -> 4)
update payments set status = 'pago', paid_at = '2099-06-01'::timestamptz
  where reservation_id = 'a0000000-0000-0000-0000-000000000004';

select ok(
  exists(
    select 1 from financial_entries
    where reservation_id = 'a0000000-0000-0000-0000-000000000004'
      and type = 'receita' and amount = 120
  ),
  'Solução 2: pagamento confirmado gera receita sozinha em financial_entries'
);

-- reafirmar o mesmo status não deve duplicar o lançamento
update payments set status = 'pago'
  where reservation_id = 'a0000000-0000-0000-0000-000000000004';

select is(
  (select count(*)::int from financial_entries where reservation_id = 'a0000000-0000-0000-0000-000000000004'),
  1,
  'Solução 2: reafirmar "pago" não gera receita duplicada'
);

-- =====================================================================
-- Solução 4/5 — fechamento de caixa diário e resumo mensal
-- =====================================================================
insert into financial_entries (entry_date, type, category, amount, description)
values ('2099-06-01', 'receita', 'passagem', 100, 'teste pgtap'),
       ('2099-06-01', 'despesa', 'combustivel', 30, 'teste pgtap');

select fn_close_day('2099-06-01'::date);

select is(
  (select net_profit from daily_closures where closure_date = '2099-06-01'),
  (120 + 100 - 30)::numeric,  -- inclui a receita automática da Solução 2
  'Solução 4: fn_close_day inclui a receita automática da Solução 2 no mesmo dia'
);

select ok(
  exists(select 1 from v_monthly_financial_summary where month = '2099-06-01'::date),
  'Solução 5: resumo mensal (view) reflete o fechamento diário'
);

-- =====================================================================
-- Solução 6 — alerta de consumo de combustível fora do padrão
-- =====================================================================
insert into fuel_records (vehicle_id, record_date, km, liters, cost) values
  ('a0000000-0000-0000-0000-000000000001', '2099-05-28', 100, 10, 60),
  ('a0000000-0000-0000-0000-000000000001', '2099-05-29', 100, 10, 60),
  ('a0000000-0000-0000-0000-000000000001', '2099-05-30', 100, 10, 60);

-- este aqui é o anômalo: custo/km bem acima da média dos 3 anteriores
insert into fuel_records (vehicle_id, record_date, km, liters, cost) values
  ('a0000000-0000-0000-0000-000000000001', '2099-05-31', 100, 10, 150);

select ok(
  exists(select 1 from notifications where template_key = 'alerta_consumo_anormal' and created_at > now() - interval '1 minute'),
  'Solução 6: abastecimento anômalo gera alerta sozinho'
);

-- abastecimento normal (dentro da média) NÃO deve gerar alerta
insert into fuel_records (vehicle_id, record_date, km, liters, cost) values
  ('a0000000-0000-0000-0000-000000000001', '2099-06-01', 100, 10, 62);

select is(
  (select count(*)::int from notifications
     where template_key = 'alerta_consumo_anormal'
       and (payload->>'custo_km_atual')::numeric = 0.62),
  0,
  'Solução 6: abastecimento dentro da média NÃO gera alerta falso-positivo'
);

-- =====================================================================
-- Solução 7 — alerta de manutenção preventiva vencendo
-- =====================================================================
insert into maintenance (id, vehicle_id, type, performed_at, odometer_km, interval_km, cost)
values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'troca de óleo teste', '2099-05-20', 1000, 300, 80);
-- km rodados desde 2099-05-20 nesta massa de teste: 100*5 = 500km > 80% de 300km

select fn_check_maintenance_due();

select ok(
  exists(select 1 from notifications where template_key = 'alerta_manutencao_vencendo' and (payload->>'maintenance_id')::uuid = 'a0000000-0000-0000-0000-000000000005'),
  'Solução 7: manutenção com km acima de 80% do intervalo gera alerta'
);

-- =====================================================================
-- Solução 5 — alerta de pagamento atrasado (reserva de dias sem pagar)
-- =====================================================================
insert into reservations (id, trip_id, customer_id, type, status, quantity, unit_price, total_price, payment_method, created_at)
values ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'passagem', 'confirmada', 1, 60, 60, 'dinheiro', now() - interval '5 days');

select fn_enqueue_overdue_payment_alerts();

select ok(
  exists(select 1 from notifications where template_key = 'pagamento_pendente_interno' and reservation_id = 'a0000000-0000-0000-0000-000000000006'),
  'Solução 5: reserva confirmada há 5 dias sem pagamento gera alerta'
);

-- =====================================================================
-- Regressão — Issue #14: capacidade validada também ao MOVER/EDITAR
-- reserva manualmente (trigger em reservations.trip_id), não só ao criar
-- =====================================================================
insert into trips (id, trip_date, direction, vehicle_id, capacity, status)
values ('a0000000-0000-0000-0000-000000000007', '2099-06-02', 'ida', 'a0000000-0000-0000-0000-000000000001', 1, 'agendada');

insert into reservations (id, trip_id, customer_id, type, status, quantity, unit_price, total_price)
values ('a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', 'passagem', 'confirmada', 1, 60, 60);
insert into reservation_passengers (reservation_id, seq, status)
values ('a0000000-0000-0000-0000-000000000008', 1, 'confirmado');
-- viagem 07 agora está 1/1 lotada

select throws_ok(
  $t$ update reservations set trip_id = 'a0000000-0000-0000-0000-000000000007' where id = 'a0000000-0000-0000-0000-000000000004' $t$,
  'P0001',
  null,
  'Issue #14: mover manualmente uma reserva com passageiro para viagem lotada é bloqueado pelo banco'
);

select * from finish();
rollback;
