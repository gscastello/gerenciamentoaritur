-- =====================================================================
-- ROTA PIRAPEMAS — 38: ALERTAS INTERNOS → PENDÊNCIAS (não mais WhatsApp)
-- =====================================================================
-- Achado da auditoria de 2026-09-16: os 4 jobs abaixo (contas a pagar
-- vencidas, consumo de combustível fora do padrão, manutenção vencendo,
-- diagnóstico de reservas) enfileiravam avisos em `notifications`
-- (channel='whatsapp') pensando em entregá-los quando o bot fosse
-- publicado — mas o DESTINATÁRIO real sempre foi a EQUIPE, nunca o
-- cliente. Sem UI nenhuma lendo `v_pending_internal_alerts` /
-- `v_diagnostico_reservas`, isso só empilhava linha morta (97 até aqui,
-- 100% em "pendente"), exatamente como o `transferToHuman` do bot
-- (ver database/32 e PR #136) antes de ser corrigido.
--
-- Agora os 4 jobs abrem uma pendência de verdade (support_tickets,
-- source='sistema') — aparece na aba Pendências + sino igual qualquer
-- outra. `diagnostico_resumo` (um registro por RODADA, mesmo sem nada
-- de novo pra reportar) deixa de existir: cada achado já vira sua
-- própria pendência, um resumo em cima disso é redundante.
--
-- Rodar depois de 01-37. Idempotente (create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Contas a pagar vencidas (14-financial-alerts.sql, solução 5)
-- ---------------------------------------------------------------------
create or replace function fn_enqueue_overdue_payment_alerts() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into support_tickets (source, phone, customer_id, subject, detail, meta)
  select 'sistema', c.phone, r.customer_id,
         'Pagamento pendente — ' || coalesce(c.name, 'cliente sem nome'),
         format('%s dia(s) em aberto, R$ %s a receber.',
                current_date - r.created_at::date, p.amount),
         jsonb_build_object('reservation_id', r.id, 'template_key', 'pagamento_pendente_interno')
  from reservations r
  join payments p on p.reservation_id = r.id and p.status = 'pendente' and p.deleted_at is null
  join customers c on c.id = r.customer_id
  where r.type = 'passagem' and r.status in ('confirmada', 'embarcado') and r.deleted_at is null
    and r.created_at::date <= current_date - 2
    and not exists (
        select 1 from support_tickets st
        where st.meta ->> 'reservation_id' = r.id::text
          and st.meta ->> 'template_key' = 'pagamento_pendente_interno'
          and st.created_at::date = current_date
      );
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Consumo de combustível fora do padrão (solução 6)
-- ---------------------------------------------------------------------
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
    insert into support_tickets (source, subject, detail, meta)
    values ('sistema', 'Consumo de combustível fora do padrão',
            format('Custo/km desta viagem R$ %s — média recente R$ %s (+%s%%).',
                   NEW.cost_per_km, round(v_avg, 4), round((NEW.cost_per_km / v_avg - 1) * 100, 0)),
            jsonb_build_object('vehicle_id', NEW.vehicle_id, 'fuel_record_id', NEW.id,
                                'trip_id', NEW.trip_id, 'template_key', 'alerta_consumo_anormal'));
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Manutenção preventiva vencendo (solução 7)
-- ---------------------------------------------------------------------
create or replace function fn_check_maintenance_due() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into support_tickets (source, subject, detail, meta)
  select 'sistema', 'Manutenção vencendo — ' || m.type,
         format('%s%% do intervalo rodado (%s km de %s km previstos).',
                round(coalesce(f.km_sum, 0) / m.interval_km * 100, 1), coalesce(f.km_sum, 0), m.interval_km),
         jsonb_build_object('maintenance_id', m.id, 'vehicle_id', m.vehicle_id, 'template_key', 'alerta_manutencao_vencendo')
  from maintenance m
  left join lateral (
      select sum(km) as km_sum from fuel_records
      where vehicle_id = m.vehicle_id and record_date >= m.performed_at and deleted_at is null
    ) f on true
  where m.deleted_at is null and m.interval_km > 0
    and coalesce(f.km_sum, 0) >= m.interval_km * 0.8
    and not exists (
        select 1 from support_tickets st
        where st.meta ->> 'template_key' = 'alerta_manutencao_vencendo'
          and st.meta ->> 'maintenance_id' = m.id::text
          and st.created_at > now() - interval '7 days'
      );
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Diagnóstico de reservas (20-diagnostico-reservas.sql) — um ticket
--    por achado NOVO (dedup 24h, igual antes); sem o resumo por rodada.
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
    insert into support_tickets (source, subject, detail, meta)
    select 'sistema',
           case a.kind
             when 'overbooking' then 'Viagem com mais passageiros que a capacidade'
             when 'ponto_invalido' then 'Reserva com ponto de embarque inválido'
             when 'sem_telefone' then 'Cliente sem telefone de contato'
             when 'quantidade_dessincronizada' then 'Quantidade de passagens fora de sincronia'
             when 'sem_viagem' then 'Passagem confirmada sem viagem associada'
             when 'pagamento_ausente' then 'Passagem confirmada sem nenhum pagamento registrado'
             else 'Diagnóstico: ' || a.kind
           end,
           a.detail::text,
           a.detail || jsonb_build_object('kind', a.kind, 'reservation_id', a.reservation_id,
                                           'trip_id', a.trip_id, 'template_key', 'alerta_diagnostico_reserva')
    from achados a
    where not exists (
      select 1 from support_tickets st
      where st.meta ->> 'template_key' = 'alerta_diagnostico_reserva'
        and st.meta ->> 'kind' = a.kind
        and st.meta ->> 'reservation_id' is not distinct from a.reservation_id::text
        and st.meta ->> 'trip_id' is not distinct from a.trip_id::text
        and st.created_at > now() - interval '24 hours'
    )
    returning 1
  )
  select count(*) into v_new_alerts from inseridos;

  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) into v_por_tipo
  from (select kind, count(*) c from public.fn_reservation_diagnostics_findings() group by kind) s;

  -- fica só no log do Postgres (query_logs) — cada achado já é uma
  -- pendência própria, um resumo por rodada em cima disso era redundante.
  if v_new_alerts > 0 then
    raise warning 'diagnostico.reservas: % novo(s) alerta(s), por_tipo=%', v_new_alerts, v_por_tipo;
  end if;

  return jsonb_build_object('success', true, 'novos_alertas', v_new_alerts, 'por_tipo', v_por_tipo);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) fn_notify_pendencia (database/32) assumia que toda pendência tem um
--    cliente por trás e caía em "Atendimento para a equipe — cliente"
--    quando não tinha — os 4 alertas acima nunca têm. Fallback melhor.
-- ---------------------------------------------------------------------
create or replace function public.fn_notify_pendencia() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nome text;
begin
  if NEW.status <> 'aberta' then
    return NEW;
  end if;
  select name into v_nome from customers where id = NEW.customer_id;
  v_nome := coalesce(
    nullif(trim(v_nome), ''), NEW.phone,
    case when NEW.source = 'sistema' then 'Sistema' else 'cliente' end
  );
  perform fn_app_notify(
    'pendencia',
    format('Atendimento para a equipe — %s', v_nome),
    coalesce(nullif(trim(NEW.subject), ''), 'Nova pendência de atendimento.'),
    null, null, null,
    jsonb_build_object('ticket_id', NEW.id, 'phone', NEW.phone, 'source', NEW.source));
  return NEW;
end;
$$;
revoke execute on function public.fn_notify_pendencia() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Limpeza: as views de apoio criadas só porque não havia como ver
--    esses avisos no painel (14 e 20) ficam órfãs — Pendências já
--    mostra tudo isso agora, com sino e resolução.
-- ---------------------------------------------------------------------
drop view if exists v_pending_internal_alerts;

comment on view v_diagnostico_reservas is
  'Achados AO VIVO do diagnóstico de reservas (issue #9) — a lista bruta, sem estado. '
  'Cada achado novo também vira uma pendência em support_tickets (fn_run_reservation_diagnostics).';
