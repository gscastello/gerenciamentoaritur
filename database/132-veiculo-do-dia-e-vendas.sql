-- 132-veiculo-do-dia-e-vendas.sql — issue #502 (etapa 1 da autonomia do bot, #501)
--
-- Em 22/11 o ônibus parou, ninguém trocou o veículo na Operação e o app ficou com 31 lugares (eram 19).
--   1) cada viagem guarda quando uma pessoa CONFIRMOU o veículo e se as vendas foram FECHADAS;
--   2) rpc_confirmar_veiculo (admin ou atendente) confirma/troca o veículo de hoje e dos próximos 7 dias;
--      trocar o veículo pela Operação (só admin) também confirma;
--   3) rpc_vendas_da_viagem fecha/abre as vendas do bot naquela viagem;
--   4) fn_vagas_para_o_bot: o que o bot SOZINHO pode vender. Vendas fechadas = 0; veículo não confirmado =
--      no máximo settings.bot_autonomia.lugares_sem_confirmacao (19). A trava é no banco
--      (trg_reservations_autonomia). A equipe e o "Agendado ☑️" não mudam.

alter table public.trips add column if not exists vehicle_confirmed_at timestamptz;
alter table public.trips add column if not exists vehicle_confirmed_by uuid references public.users(id);
alter table public.trips add column if not exists sales_closed_at timestamptz;
alter table public.trips add column if not exists sales_closed_by uuid references public.users(id);

insert into public.settings (key, value)
select 'bot_autonomia', '{"lugares_sem_confirmacao": 19, "teto_usd_mes": 120, "grupos": []}'::jsonb
where not exists (select 1 from public.settings where key = 'bot_autonomia');

-- a troca de verdade (sem conferir papel): usada pelas duas RPCs
create or replace function public.fn_trocar_veiculo_da_viagem(p_trip_date date, p_direction trip_direction, p_vehicle_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_veiculo  public.vehicles%rowtype;
  v_viagem   public.trips%rowtype;
  v_ocupados integer;
begin
  if p_trip_date is null or p_trip_date < (now() at time zone 'America/Fortaleza')::date then
    return jsonb_build_object('success', false, 'code', 'DATA_PASSADA', 'message', 'Escolha hoje ou um dia futuro.');
  end if;
  select * into v_veiculo from public.vehicles where id = p_vehicle_id and active and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'code', 'VEICULO', 'message', 'Veículo não encontrado.');
  end if;
  select * into v_viagem from public.trips
   where trip_date = p_trip_date and direction = p_direction and deleted_at is null for update;
  if not found then
    insert into public.trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by, updated_by,
                              vehicle_confirmed_at, vehicle_confirmed_by)
    values (p_trip_date, p_direction, v_veiculo.id, v_veiculo.capacity,
            (extract(dow from p_trip_date) = 1 and p_direction = 'ida'), 'agendada', p_actor, p_actor, now(), p_actor)
    returning * into v_viagem;
    return jsonb_build_object('success', true, 'message', 'created', 'trip_id', v_viagem.id, 'capacity', v_viagem.capacity);
  end if;
  if v_viagem.status <> 'agendada' then
    return jsonb_build_object('success', false, 'code', 'VIAGEM_SAIU', 'message', 'Essa viagem já saiu: o veículo não muda mais.');
  end if;
  select occupied into v_ocupados from public.v_trip_occupancy where trip_id = v_viagem.id;
  if coalesce(v_ocupados, 0) > v_veiculo.capacity then
    return jsonb_build_object(
      'success', false, 'code', 'LOTACAO_MAIOR',
      'message', format('Essa viagem já tem %s passageiros e %s leva %s. Mova ou cancele %s antes de trocar.',
                        v_ocupados, v_veiculo.name, v_veiculo.capacity, v_ocupados - v_veiculo.capacity),
      'occupied', v_ocupados, 'capacity', v_veiculo.capacity);
  end if;
  update public.trips
     set vehicle_id = v_veiculo.id, capacity = v_veiculo.capacity, updated_by = p_actor,
         vehicle_confirmed_at = now(), vehicle_confirmed_by = p_actor
   where id = v_viagem.id;
  return jsonb_build_object('success', true, 'message', 'updated', 'trip_id', v_viagem.id, 'capacity', v_veiculo.capacity, 'occupied', coalesce(v_ocupados, 0));
end;
$function$;
revoke all on function public.fn_trocar_veiculo_da_viagem(date, trip_direction, uuid, uuid) from public, anon, authenticated;

create or replace function public.rpc_veiculo_da_viagem(p_trip_date date, p_direction trip_direction, p_vehicle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'code', 'SEM_PERMISSAO', 'message', 'Só o administrador troca o veículo da viagem.');
  end if;
  return fn_trocar_veiculo_da_viagem(p_trip_date, p_direction, p_vehicle_id, auth.uid());
end;
$function$;

-- o atendente também confirma (hoje e os próximos 7 dias)
create or replace function public.rpc_confirmar_veiculo(p_trip_date date, p_direction trip_direction, p_vehicle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para confirmar o veículo.');
  end if;
  if p_trip_date > (now() at time zone 'America/Fortaleza')::date + 7 then
    return jsonb_build_object('success', false, 'code', 'DATA_LONGE', 'message', 'Confirme o veículo até 7 dias antes.');
  end if;
  return fn_trocar_veiculo_da_viagem(p_trip_date, p_direction, p_vehicle_id, auth.uid());
end;
$function$;
revoke all on function public.rpc_confirmar_veiculo(date, trip_direction, uuid) from public, anon;
grant execute on function public.rpc_confirmar_veiculo(date, trip_direction, uuid) to authenticated;

create or replace function public.rpc_vendas_da_viagem(p_trip_id uuid, p_fechar boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão.');
  end if;
  update public.trips
     set sales_closed_at = case when p_fechar then coalesce(sales_closed_at, now()) end,
         sales_closed_by = case when p_fechar then coalesce(sales_closed_by, auth.uid()) end,
         updated_by = auth.uid()
   where id = p_trip_id and deleted_at is null
     and trip_date >= (now() at time zone 'America/Fortaleza')::date;
  if not found then
    return jsonb_build_object('success', false, 'code', 'VIAGEM', 'message', 'Viagem não encontrada (ou já passou).');
  end if;
  return jsonb_build_object('success', true, 'fechada', p_fechar);
end;
$function$;
revoke all on function public.rpc_vendas_da_viagem(uuid, boolean) from public, anon;
grant execute on function public.rpc_vendas_da_viagem(uuid, boolean) to authenticated;

-- o que o bot sozinho pode vender
create or replace function public.fn_vagas_para_o_bot(p_trip_date date, p_direction trip_direction)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with lim as (
    select coalesce(nullif((select value->>'lugares_sem_confirmacao' from settings where key = 'bot_autonomia'), '')::int, 19) n
  ),
  v as (
    select t.capacity, o.occupied, t.vehicle_confirmed_at is not null as confirmado, t.sales_closed_at is not null as fechada
      from trips t join v_trip_occupancy o on o.trip_id = t.id
     where t.trip_date = p_trip_date and t.direction = p_direction and t.deleted_at is null
    union all
    select (select capacity from vehicles where is_default and active and deleted_at is null limit 1), 0, false, false
     where not exists (select 1 from trips where trip_date = p_trip_date and direction = p_direction and deleted_at is null)
    limit 1
  )
  select jsonb_build_object(
    'capacity', case when v.confirmado then v.capacity else least(v.capacity, lim.n) end,
    'occupied', v.occupied,
    'available', case when v.fechada then 0
                      else greatest(0, (case when v.confirmado then v.capacity else least(v.capacity, lim.n) end) - v.occupied) end,
    'confirmado', v.confirmado,
    'vendas_fechadas', v.fechada)
  from v, lim
$function$;
revoke all on function public.fn_vagas_para_o_bot(date, trip_direction) from public, anon, authenticated;
grant execute on function public.fn_vagas_para_o_bot(date, trip_direction) to service_role;

-- trava no banco: reserva criada pelo bot SEM a marca da equipe
create or replace function public.fn_trava_da_autonomia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_trip trips%rowtype;
  v jsonb;
begin
  if new.type <> 'passagem' or new.status not in ('confirmada', 'pendente')
     or coalesce(new.extra_data->>'origem', '') in ('agendado_equipe', 'claude_agendar')
     or new.created_by is distinct from (select id from users where name = 'Bot WhatsApp' and deleted_at is null limit 1) then
    return new;
  end if;
  select * into v_trip from trips where id = new.trip_id for update;
  v := fn_vagas_para_o_bot(v_trip.trip_date, v_trip.direction);
  if (v->>'vendas_fechadas')::boolean then
    raise exception 'VENDAS_FECHADAS: a equipe fechou as vendas dessa viagem.' using errcode = 'P0001';
  end if;
  if (v->>'available')::int < new.quantity then
    raise exception 'SEM_VAGA_PARA_O_BOT: só % vaga(s) que o bot pode vender nessa viagem%.', v->>'available',
      case when (v->>'confirmado')::boolean then '' else ' (veículo do dia não confirmado)' end using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
revoke all on function public.fn_trava_da_autonomia() from public, anon, authenticated;
drop trigger if exists trg_reservations_autonomia on public.reservations;
create trigger trg_reservations_autonomia before insert on public.reservations
  for each row execute function public.fn_trava_da_autonomia();

-- Testado ao aplicar, dentro da própria migração e desfeito: sem confirmação o bot não passa de 19; o
-- "Agendado ☑️" passa; confirmado, vale a capacidade; vendas fechadas barram o bot; anon sem acesso.
