-- =====================================================================
-- ROTA PIRAPEMAS — 101: VENCIMENTOS (IMPOSTO, DOCUMENTOS, CNH) (#366, #369)
-- =====================================================================
-- Rodar depois de 01–100. Idempotente.
-- Calendário de contas e documentos com data: DAS do Simples (dia 20), IPVA,
-- seguro, licenciamento, vistoria, parcelas, CNH dos motoristas. Todo dia às
-- 07:30 (São Luís) o sino avisa o que vence dentro do prazo de aviso e o que
-- venceu sem ser quitado. Quitar uma conta que se repete (mensal/anual) já
-- agenda a próxima. A CNH vem sozinha de drivers.license_expires_at.
-- Também: o aviso de manutenção por km passa a olhar só a ÚLTIMA manutenção
-- de cada tipo por veículo (a antiga, já refeita, não avisa mais).
-- =====================================================================

create table if not exists public.vencimentos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(btrim(titulo)) between 2 and 120),
  categoria    text not null default 'outro'
                 check (categoria in ('imposto', 'veiculo', 'motorista', 'seguro', 'parcela', 'outro')),
  vehicle_id   uuid references public.vehicles(id),
  vence_em     date not null,
  valor        numeric(12, 2) check (valor is null or valor >= 0),
  recorrencia  text not null default 'nenhuma' check (recorrencia in ('nenhuma', 'mensal', 'anual')),
  avisar_dias  integer not null default 15 check (avisar_dias between 0 and 120),
  quitado_em   date,
  notas        text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_vencimentos_abertos on public.vencimentos (vence_em) where quitado_em is null and deleted_at is null;

drop trigger if exists trg_vencimentos_updated_at on public.vencimentos;
create trigger trg_vencimentos_updated_at before update on public.vencimentos
  for each row execute function public.fn_set_updated_at();

alter table public.vencimentos enable row level security;
drop policy if exists vencimentos_select on public.vencimentos;
create policy vencimentos_select on public.vencimentos for select to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])) and deleted_at is null);
drop policy if exists vencimentos_insert on public.vencimentos;
create policy vencimentos_insert on public.vencimentos for insert to authenticated
  with check ((select fn_has_role(array['admin', 'financeiro']::user_role[])));
drop policy if exists vencimentos_update on public.vencimentos;
create policy vencimentos_update on public.vencimentos for update to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])))
  with check ((select fn_has_role(array['admin', 'financeiro']::user_role[])));
grant select, insert, update on public.vencimentos to authenticated;

-- Quitar: marca o pago e, se repete, agenda o próximo (mesmo dia do mês/ano).
create or replace function public.rpc_quitar_vencimento(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v vencimentos%rowtype;
  v_prox date;
begin
  if not fn_has_role(array['admin', 'financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Só admin ou financeiro quita vencimentos.');
  end if;
  select * into v from vencimentos where id = p_id and deleted_at is null for update;
  if not found then return jsonb_build_object('success', false, 'message', 'Vencimento não encontrado.'); end if;
  if v.quitado_em is not null then return jsonb_build_object('success', false, 'message', 'Já estava quitado.'); end if;
  update vencimentos set quitado_em = (now() at time zone 'America/Fortaleza')::date where id = p_id;
  if v.recorrencia <> 'nenhuma' then
    v_prox := case v.recorrencia when 'mensal' then (v.vence_em + interval '1 month')::date
                                 else (v.vence_em + interval '1 year')::date end;
    insert into vencimentos (titulo, categoria, vehicle_id, vence_em, valor, recorrencia, avisar_dias, notas, created_by)
    values (v.titulo, v.categoria, v.vehicle_id, v_prox, v.valor, v.recorrencia, v.avisar_dias, v.notas, auth.uid());
  end if;
  return jsonb_build_object('success', true, 'proximo', v_prox);
end $$;
revoke all on function public.rpc_quitar_vencimento(uuid) from public, anon;
grant execute on function public.rpc_quitar_vencimento(uuid) to authenticated;

-- Aviso diário no sino: cada vencimento avisa uma vez ao entrar no prazo e uma vez se vencer sem quitar.
create or replace function public.fn_avisar_vencimentos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  n integer := 0;
  k integer;
begin
  insert into app_notifications (kind, title, body, meta)
  select 'vencimento',
         case when v.vence_em < v_hoje then 'Venceu: ' || v.titulo else 'Vence em breve: ' || v.titulo end,
         format('%s%s.', to_char(v.vence_em, 'DD/MM/YYYY'),
                case when v.valor is not null then ' · R$ ' || replace(to_char(v.valor, 'FM999G990D00'), ',', '.') else '' end),
         jsonb_build_object('vencimento_id', v.id, 'vence_em', v.vence_em,
                            'fase', case when v.vence_em < v_hoje then 'vencido' else 'prazo' end)
    from vencimentos v
   where v.deleted_at is null and v.quitado_em is null
     and v.vence_em <= v_hoje + v.avisar_dias
     and not exists (
       select 1 from app_notifications a
        where a.kind = 'vencimento'
          and a.meta ->> 'vencimento_id' = v.id::text
          and a.meta ->> 'vence_em' = v.vence_em::text
          and a.meta ->> 'fase' = case when v.vence_em < v_hoje then 'vencido' else 'prazo' end);
  get diagnostics k = row_count; n := n + k;

  -- CNH dos motoristas (30 dias antes)
  insert into app_notifications (kind, title, body, meta)
  select 'vencimento',
         case when d.license_expires_at < v_hoje then 'CNH vencida: ' else 'CNH vence em breve: ' end || d.name,
         format('Validade %s.', to_char(d.license_expires_at, 'DD/MM/YYYY')),
         jsonb_build_object('driver_id', d.id, 'vence_em', d.license_expires_at,
                            'fase', case when d.license_expires_at < v_hoje then 'vencido' else 'prazo' end)
    from drivers d
   where d.deleted_at is null and coalesce(d.active, true)
     and d.license_expires_at is not null and d.license_expires_at <= v_hoje + 30
     and not exists (
       select 1 from app_notifications a
        where a.kind = 'vencimento'
          and a.meta ->> 'driver_id' = d.id::text
          and a.meta ->> 'vence_em' = d.license_expires_at::text
          and a.meta ->> 'fase' = case when d.license_expires_at < v_hoje then 'vencido' else 'prazo' end);
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function public.fn_avisar_vencimentos() from public, anon, authenticated;

-- 10:30 UTC = 07:30 em São Luís
do $$ begin
  perform cron.unschedule('avisar-vencimentos') where exists (select 1 from cron.job where jobname = 'avisar-vencimentos');
  perform cron.schedule('avisar-vencimentos', '30 10 * * *', $c$ select public.fn_avisar_vencimentos(); $c$);
end $$;

-- Manutenção por km: só a última de cada tipo por veículo conta.
create or replace function public.fn_check_maintenance_due()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into support_tickets (source, subject, detail, meta)
  select 'sistema', 'Manutenção vencendo — ' || m.type,
         format('%s%% do intervalo rodado (%s km de %s km previstos).',
                round(coalesce(f.km_sum, 0) / m.interval_km * 100, 1), coalesce(f.km_sum, 0), m.interval_km),
         jsonb_build_object('maintenance_id', m.id, 'vehicle_id', m.vehicle_id, 'template_key', 'alerta_manutencao_vencendo')
  from (
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
    and not exists (
        select 1 from support_tickets st
        where st.meta ->> 'template_key' = 'alerta_manutencao_vencendo'
          and st.meta ->> 'maintenance_id' = m.id::text
          and st.created_at > now() - interval '7 days'
      );
end $$;

-- DAS do Simples Nacional: vence todo dia 20 (o próximo, se ainda não houver)
insert into vencimentos (titulo, categoria, vence_em, recorrencia, avisar_dias, notas)
select 'DAS — Simples Nacional', 'imposto',
       case when extract(day from (now() at time zone 'America/Fortaleza')) <= 20
            then (date_trunc('month', now() at time zone 'America/Fortaleza') + interval '19 days')::date
            else (date_trunc('month', now() at time zone 'America/Fortaleza') + interval '1 month 19 days')::date end,
       'mensal', 5, 'Valor estimado na tela Vencimentos; o contador confirma.'
where not exists (select 1 from vencimentos where categoria = 'imposto' and titulo like 'DAS%' and deleted_at is null);

-- Tipos de aviso do sino: 'vencimento' (e os da frota e do fechamento do mês,
-- issues #365 e #369) precisam estar na lista, senão o insert falha.
alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check check (kind = any (array[
  'lotacao', 'cancelamento', 'mudanca_embarque', 'mudanca_desembarque', 'pendencia',
  'vencimento', 'consumo', 'manutencao', 'fechamento']));

-- Aviso de vencimento mostra valores da empresa: só admin e financeiro veem.
drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select on public.app_notifications for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente', 'motorista', 'financeiro']::user_role[]))
         and (kind <> 'vencimento' or (select fn_has_role(array['admin', 'financeiro']::user_role[]))));
