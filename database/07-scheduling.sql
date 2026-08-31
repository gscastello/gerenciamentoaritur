-- =====================================================================
-- ROTA PIRAPEMAS — 07: AGENDAMENTO DOS AVISOS (motorista a caminho + lembrete)
-- =====================================================================
-- Rodar depois de 06-whatsapp.sql. Requer as extensões pg_cron e pg_net
-- habilitadas no projeto (Database → Extensions no painel do Supabase).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 1) "Motorista a caminho" — dispara sozinho quando rpc_start_trip roda
-- ---------------------------------------------------------------------
create or replace function fn_enqueue_driver_en_route() returns trigger as $$
begin
  if NEW.status = 'em_andamento' and (OLD.status is distinct from 'em_andamento') then
    insert into notifications (customer_id, reservation_id, trip_id, channel, template_key, payload, status)
    select r.customer_id, r.id, NEW.id, 'whatsapp', 'motorista_a_caminho',
           jsonb_build_object('local', coalesce(rp.name, r.pickup_neighborhood, r.dropoff_location, '')),
           'pendente'
    from reservations r
    left join route_points rp on rp.id = r.route_point_id
    where r.trip_id = NEW.id and r.status in ('confirmada', 'embarcado') and r.deleted_at is null;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_enqueue_driver_en_route after update of status on trips
  for each row execute function fn_enqueue_driver_en_route();

-- ---------------------------------------------------------------------
-- 2) Lembrete de viagem — roda a cada 10 min via pg_cron, enfileirando
-- lembrete para viagens que partem entre 45 e 75 minutos a partir de
-- agora (janela de 30 min de folga para não perder nem duplicar o aviso)
-- ---------------------------------------------------------------------
create or replace function fn_enqueue_trip_reminders() returns void as $$
begin
  insert into notifications (customer_id, reservation_id, trip_id, channel, template_key, payload, status)
  select r.customer_id, r.id, t.id, 'whatsapp', 'lembrete_viagem',
         jsonb_build_object('horario', to_char(t.trip_date, 'DD/MM') || ' — ' || coalesce(rp.base_time::text, ''),
                             'local', coalesce(rp.name, r.pickup_neighborhood, '')),
         'pendente'
  from trips t
  join reservations r on r.trip_id = t.id and r.status in ('confirmada', 'embarcado') and r.deleted_at is null
  left join route_points rp on rp.id = r.route_point_id
  where t.status = 'agendada'
    and t.trip_date = current_date
    -- ainda não existe um lembrete enfileirado/enviado para esta reserva
    and not exists (
      select 1 from notifications n
      where n.reservation_id = r.id and n.template_key = 'lembrete_viagem'
    )
    and (t.trip_date::timestamp + coalesce(rp.base_time, '00:00'::time))
        between (now() + interval '45 minutes') and (now() + interval '75 minutes');
end;
$$ language plpgsql;

select cron.schedule('enqueue-trip-reminders', '*/10 * * * *', 'select fn_enqueue_trip_reminders();');

-- ---------------------------------------------------------------------
-- 3) Disparo efetivo: pg_cron chama a Edge Function a cada 5 minutos
-- (troque a URL e o segredo pelos valores reais do seu projeto — o
-- mesmo DISPATCH_SECRET configurado nos secrets da função)
-- ---------------------------------------------------------------------
select cron.schedule(
  'dispatch-whatsapp-notifications',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.functions.supabase.co/whatsapp-notifications-dispatcher',
    headers := jsonb_build_object('x-dispatch-secret', 'COLOQUE_O_MESMO_VALOR_DO_SECRET_AQUI'),
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir os jobs agendados a qualquer momento:
-- select * from cron.job;
-- Para ver o histórico de execuções:
-- select * from cron.job_run_details order by start_time desc limit 20;
