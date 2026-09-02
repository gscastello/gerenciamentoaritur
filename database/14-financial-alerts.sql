-- =====================================================================
-- AUTOMACAO FINANCEIRA -- parte 2: alertas automaticos
-- =====================================================================
-- Aplicado e testado em producao em 2026-09-02 via Supabase MCP, dentro
-- de transacoes revertidas (BEGIN...ROLLBACK) com dado real. Os alertas
-- ficam na fila de `notifications` (channel='whatsapp'), prontos para
-- serem entregues quando o dispatcher do WhatsApp estiver no ar; ate la
-- da para consultar direto via v_pending_internal_alerts.
-- =====================================================================

-- Solucao 5: reserva confirmada ha mais de 2 dias sem pagamento
create or replace function fn_enqueue_overdue_payment_alerts() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into notifications (customer_id, reservation_id, channel, template_key, payload, status)
  select r.customer_id, r.id, 'whatsapp', 'pagamento_pendente_interno',
         jsonb_build_object('valor', p.amount, 'dias_em_aberto', (current_date - r.created_at::date)),
         'pendente'
  from reservations r
  join payments p on p.reservation_id = r.id and p.status = 'pendente' and p.deleted_at is null
  where r.type = 'passagem' and r.status in ('confirmada', 'embarcado') and r.deleted_at is null
    and r.created_at::date <= current_date - 2
    and not exists (
        select 1 from notifications n
        where n.reservation_id = r.id and n.template_key = 'pagamento_pendente_interno'
          and n.created_at::date = current_date
      );
end;
$$;

select cron.schedule('alert-overdue-payments', '0 9 * * *', 'select fn_enqueue_overdue_payment_alerts();');

-- Solucao 6: consumo de combustivel fora do padrao (20% acima da media
-- dos ultimos 10 abastecimentos do mesmo veiculo)
create or replace function fn_check_fuel_anomaly() returns trigger
language plpgsql set search_path to 'public' as $$
declare
  v_avg numeric;
begin
  if NEW.km is null or NEW.km <= 0 then return NEW; end if;

  select avg(cost_per_km) into v_avg from (
        select cost_per_km from fuel_records
        where vehicle_id = NEW.vehicle_id and id <> NEW.id and km > 0 and deleted_at is null
        order by record_date desc limit 10
      ) recentes;

  if v_avg is not null and v_avg > 0 and NEW.cost_per_km > v_avg * 1.2 then
    insert into notifications (trip_id, channel, template_key, payload, status)
    values (NEW.trip_id, 'whatsapp', 'alerta_consumo_anormal',
          jsonb_build_object('vehicle_id', NEW.vehicle_id, 'fuel_record_id', NEW.id,
                              'custo_km_atual', NEW.cost_per_km, 'media_recente', round(v_avg, 4)),
          'pendente');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_fuel_anomaly on fuel_records;
create trigger trg_check_fuel_anomaly
  after insert on fuel_records
  for each row execute function fn_check_fuel_anomaly();

-- Solucao 7: manutencao preventiva vencendo (>= 80% do intervalo, km
-- rodados desde a data da ultima manutencao)
create or replace function fn_check_maintenance_due() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into notifications (channel, template_key, payload, status)
  select 'whatsapp', 'alerta_manutencao_vencendo',
         jsonb_build_object('maintenance_id', m.id, 'vehicle_id', m.vehicle_id, 'tipo', m.type,
                               'km_desde_ultima', coalesce(f.km_sum, 0), 'intervalo_km', m.interval_km,
                               'percentual', round(coalesce(f.km_sum, 0) / m.interval_km * 100, 1)),
         'pendente'
  from maintenance m
  left join lateral (
      select sum(km) as km_sum from fuel_records
      where vehicle_id = m.vehicle_id and record_date >= m.performed_at and deleted_at is null
    ) f on true
  where m.deleted_at is null and m.interval_km > 0
    and coalesce(f.km_sum, 0) >= m.interval_km * 0.8
    and not exists (
        select 1 from notifications n
        where n.template_key = 'alerta_manutencao_vencendo'
          and (n.payload ->> 'maintenance_id')::uuid = m.id
          and n.created_at > now() - interval '7 days'
      );
end;
$$;

select cron.schedule('check-maintenance-due', '0 8 * * *', 'select fn_check_maintenance_due();');

-- View de apoio: ver os alertas ainda nao entregues, direto no banco,
-- enquanto o WhatsApp nao esta no ar para entrega-los sozinho.
-- security_invoker = true: respeita a RLS de `notifications` (so
-- admin/atendente/financeiro), nao roda com privilegio de quem a criou.
create or replace view v_pending_internal_alerts
with (security_invoker = true)
as
select id, template_key, payload, created_at
from notifications
where status = 'pendente' and channel = 'whatsapp'
order by created_at desc;
