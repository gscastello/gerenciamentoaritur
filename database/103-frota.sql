-- 103-frota.sql — issue #369 (item 4 da lista de automações)
--
-- 1. Consumo fora do normal: cada abastecimento lançado (à mão ou pela foto da
--    nota) é comparado com o normal do veículo e, fora dele, avisa no sino.
--    MESMA regra de frontend/src/domain/frota.js (REGRA_DE_CONSUMO):
--      com litros → km/l abaixo de 85% da mediana dos últimos 8 anteriores;
--      sem litros → custo por km acima de 120% da mediana;
--      menos de 3 anteriores → não há normal, não avisa.
-- 2. Manutenção perto do km: o aviso que já ia para Pendências (80% do intervalo,
--    fn_check_maintenance_due, database/101) também aparece no sino.
-- 3. Vencimentos: categoria 'licenca' (ANTT, autorização de linha, alvará).
-- Documentos com aviso 30 dias antes (CNH, seguro, vistoria, licenciamento)
-- já são os vencimentos de database/101.

-- 1 ─ consumo ─────────────────────────────────────────────────────────────────
create or replace function public.fn_consumo_do_abastecimento(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r fuel_records%rowtype;
  v_atual numeric;
  v_normal numeric;
  v_base int;
begin
  select * into r from fuel_records where id = p_id and deleted_at is null;
  if not found or coalesce(r.km, 0) <= 0 then return null; end if;

  if coalesce(r.liters, 0) > 0 then
    v_atual := round(r.km / r.liters, 2);
    select round(percentile_cont(0.5) within group (order by x)::numeric, 2), count(*)
      into v_normal, v_base
      from (select round(f.km / f.liters, 2) as x
              from fuel_records f
             where f.vehicle_id = r.vehicle_id and f.deleted_at is null and f.id <> r.id
               and f.km > 0 and f.liters > 0
               and (f.record_date < r.record_date
                    or (f.record_date = r.record_date and f.id::text collate "C" < r.id::text collate "C"))
             order by f.record_date desc, f.id::text collate "C" desc
             limit 8) b;
    if v_base < 3 then return null; end if;
    return jsonb_build_object('fora', v_atual < v_normal * 0.85, 'medida', 'km_l', 'atual', v_atual, 'normal', v_normal);
  end if;

  if coalesce(r.cost, 0) <= 0 then return null; end if;
  v_atual := round(r.cost / r.km, 4);
  select round(percentile_cont(0.5) within group (order by x)::numeric, 4), count(*)
    into v_normal, v_base
    from (select round(f.cost / f.km, 4) as x
            from fuel_records f
           where f.vehicle_id = r.vehicle_id and f.deleted_at is null and f.id <> r.id
             and f.km > 0 and f.cost > 0
             and (f.record_date < r.record_date
                  or (f.record_date = r.record_date and f.id::text collate "C" < r.id::text collate "C"))
           order by f.record_date desc, f.id::text collate "C" desc
           limit 8) b;
  if v_base < 3 then return null; end if;
  return jsonb_build_object('fora', v_atual > v_normal * 1.2, 'medida', 'custo_km', 'atual', v_atual, 'normal', v_normal);
end $$;

revoke all on function public.fn_consumo_do_abastecimento(uuid) from public, anon, authenticated;

create or replace function public.fn_avisar_consumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c jsonb;
  v_nome text;
begin
  if new.deleted_at is not null then return new; end if;
  c := fn_consumo_do_abastecimento(new.id);
  if c is null or not (c ->> 'fora')::boolean then return new; end if;
  -- um aviso por abastecimento (editar de novo não repete)
  if exists (select 1 from app_notifications
              where kind = 'consumo' and meta ->> 'fuel_record_id' = new.id::text) then
    return new;
  end if;
  select coalesce(nullif(name, ''), plate, 'veículo') into v_nome from vehicles where id = new.vehicle_id;
  insert into app_notifications (kind, title, body, trip_date, direction, meta)
  values ('consumo',
          'Consumo fora do normal — ' || coalesce(v_nome, 'veículo'),
          case when c ->> 'medida' = 'km_l'
               then format('%s km/l no abastecimento de %s; o normal desse veículo é %s km/l. Confira o km, os litros ou o veículo.',
                           replace((c ->> 'atual')::numeric(10,1)::text, '.', ','), to_char(new.record_date, 'DD/MM'),
                           replace((c ->> 'normal')::numeric(10,1)::text, '.', ','))
               else format('Custo por km de R$ %s no abastecimento de %s; o normal é R$ %s. Confira o km, o valor ou o veículo.',
                           replace((c ->> 'atual')::numeric(10,2)::text, '.', ','), to_char(new.record_date, 'DD/MM'),
                           replace((c ->> 'normal')::numeric(10,2)::text, '.', ','))
          end,
          new.record_date, new.direction,
          jsonb_build_object('fuel_record_id', new.id, 'vehicle_id', new.vehicle_id) || c);
  return new;
end $$;

drop trigger if exists trg_avisar_consumo on public.fuel_records;
create trigger trg_avisar_consumo
  after insert or update of km, liters, cost, record_date, vehicle_id on public.fuel_records
  for each row execute function public.fn_avisar_consumo();

-- 2 ─ manutenção no sino ──────────────────────────────────────────────────────
create or replace function public.fn_check_maintenance_due()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  with devidas as (
    select m.id, m.vehicle_id, m.type, m.interval_km, coalesce(f.km_sum, 0) as km_sum,
           round(coalesce(f.km_sum, 0) / m.interval_km * 100, 1) as pct
      from (
        -- só a última manutenção de cada tipo por veículo (database/101)
        select distinct on (vehicle_id, lower(type)) *
          from maintenance
         where deleted_at is null
         order by vehicle_id, lower(type), performed_at desc, created_at desc
      ) m
      left join lateral (
          select sum(km) as km_sum from fuel_records
          where vehicle_id = m.vehicle_id and record_date >= m.performed_at and deleted_at is null
        ) f on true
     where m.interval_km > 0
       and coalesce(f.km_sum, 0) >= m.interval_km * 0.8
  ),
  pend as (
    insert into support_tickets (source, subject, detail, meta)
    select 'sistema', 'Manutenção vencendo — ' || d.type,
           format('%s%% do intervalo rodado (%s km de %s km previstos).', d.pct, d.km_sum, d.interval_km),
           jsonb_build_object('maintenance_id', d.id, 'vehicle_id', d.vehicle_id, 'template_key', 'alerta_manutencao_vencendo')
      from devidas d
     where not exists (
        select 1 from support_tickets st
         where st.meta ->> 'template_key' = 'alerta_manutencao_vencendo'
           and st.meta ->> 'maintenance_id' = d.id::text
           and st.created_at > now() - interval '7 days')
    returning 1
  )
  insert into app_notifications (kind, title, body, meta)
  select 'manutencao',
         'Manutenção perto do km — ' || d.type || coalesce(' (' || nullif(v.name, '') || ')', ''),
         case when d.km_sum >= d.interval_km
              then format('Passou do intervalo: %s km rodados de %s km previstos.', d.km_sum, d.interval_km)
              else format('%s%% do intervalo rodado (%s km de %s km previstos).', d.pct, d.km_sum, d.interval_km) end,
         jsonb_build_object('maintenance_id', d.id, 'vehicle_id', d.vehicle_id, 'pct', d.pct)
    from devidas d
    left join vehicles v on v.id = d.vehicle_id
   where not exists (
      select 1 from app_notifications a
       where a.kind = 'manutencao'
         and a.meta ->> 'maintenance_id' = d.id::text
         and a.created_at > now() - interval '7 days');
end $function$;

-- 3 ─ licenças nos vencimentos ────────────────────────────────────────────────
alter table public.vencimentos drop constraint if exists vencimentos_categoria_check;
alter table public.vencimentos add constraint vencimentos_categoria_check
  check (categoria in ('imposto', 'veiculo', 'motorista', 'seguro', 'parcela', 'licenca', 'outro'));
