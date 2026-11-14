-- 108 — Veículo de UMA viagem (issue #408)
--
-- O dono escolhe na Operação o dia e o sentido em que a van reserva (15 lugares) roda no lugar
-- do ônibus (31). Antes, tocar no veículo o tornava PADRÃO para todas as viagens criadas dali em
-- diante (fn_ensure_upcoming_trips cria 30 dias à frente com o padrão): a van virou padrão em
-- 14/11 e a viagem de 14/12 nasceu com 15 lugares.
--
-- rpc_veiculo_da_viagem(dia, sentido, veículo): troca o veículo e a capacidade só daquela viagem
-- (cria a viagem se ainda não existe). Recusa se a viagem já tem mais passageiros do que o
-- veículo leva, ou se já saiu. Só admin (a Operação é do admin). Auditado pelo trg_audit_trips.

create or replace function public.rpc_veiculo_da_viagem(
  p_trip_date date,
  p_direction trip_direction,
  p_vehicle_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_veiculo  public.vehicles%rowtype;
  v_viagem   public.trips%rowtype;
  v_ocupados integer;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'code', 'SEM_PERMISSAO', 'message', 'Só o administrador troca o veículo da viagem.');
  end if;
  if p_trip_date is null or p_trip_date < (now() at time zone 'America/Fortaleza')::date then
    return jsonb_build_object('success', false, 'code', 'DATA_PASSADA', 'message', 'Escolha hoje ou um dia futuro.');
  end if;

  select * into v_veiculo from public.vehicles
   where id = p_vehicle_id and active and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'code', 'VEICULO', 'message', 'Veículo não encontrado.');
  end if;

  select * into v_viagem from public.trips
   where trip_date = p_trip_date and direction = p_direction and deleted_at is null
   for update;

  if not found then
    insert into public.trips (trip_date, direction, vehicle_id, capacity, monday_adjusted, status, created_by, updated_by)
    values (p_trip_date, p_direction, v_veiculo.id, v_veiculo.capacity,
            (extract(dow from p_trip_date) = 1 and p_direction = 'ida'), 'agendada', auth.uid(), auth.uid())
    returning * into v_viagem;
    return jsonb_build_object('success', true, 'message', 'created', 'trip_id', v_viagem.id, 'capacity', v_viagem.capacity);
  end if;

  if v_viagem.status <> 'agendada' then
    return jsonb_build_object('success', false, 'code', 'VIAGEM_SAIU', 'message', 'Essa viagem já saiu: o veículo não muda mais.');
  end if;

  select occupied into v_ocupados from public.v_trip_occupancy where trip_id = v_viagem.id;
  if coalesce(v_ocupados, 0) > v_veiculo.capacity then
    return jsonb_build_object(
      'success', false,
      'code', 'LOTACAO_MAIOR',
      'message', format('Essa viagem já tem %s passageiros e %s leva %s. Mova ou cancele %s antes de trocar.',
                        v_ocupados, v_veiculo.name, v_veiculo.capacity, v_ocupados - v_veiculo.capacity),
      'occupied', v_ocupados,
      'capacity', v_veiculo.capacity
    );
  end if;

  update public.trips
     set vehicle_id = v_veiculo.id, capacity = v_veiculo.capacity, updated_by = auth.uid()
   where id = v_viagem.id;

  return jsonb_build_object('success', true, 'message', 'updated', 'trip_id', v_viagem.id, 'capacity', v_veiculo.capacity, 'occupied', coalesce(v_ocupados, 0));
end;
$$;

revoke all on function public.rpc_veiculo_da_viagem(date, trip_direction, uuid) from public, anon;
grant execute on function public.rpc_veiculo_da_viagem(date, trip_direction, uuid) to authenticated;

-- O ônibus volta a ser o padrão (a van virou padrão sem querer em 14/11) e as viagens criadas
-- com a van por causa disso voltam para o ônibus — só as que ninguém escolheu de propósito
-- (criadas pela rotina, sem passageiro a mais do que o ônibus comporta).
do $$
declare
  v_onibus uuid;
begin
  select id into v_onibus from public.vehicles
   where type = 'onibus' and active and deleted_at is null
   order by capacity desc limit 1;
  if v_onibus is null then
    raise exception 'sem ônibus ativo para voltar a ser o padrão';
  end if;
  update public.vehicles set is_default = false where is_default and id <> v_onibus;
  update public.vehicles set is_default = true where id = v_onibus;

  update public.trips t
     set vehicle_id = v.id, capacity = v.capacity
    from public.vehicles v
   where v.id = v_onibus
     and t.deleted_at is null and t.status = 'agendada'
     and t.trip_date >= date '2026-11-14'
     and t.vehicle_id is distinct from v_onibus
     and t.created_by is null
     and t.created_at >= timestamptz '2026-11-14 00:00:00-03';
end $$;
