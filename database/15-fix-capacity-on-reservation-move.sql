-- =====================================================================
-- FIX Issue #14 -- "Validar overbooking tambem na edicao manual de reserva"
-- =====================================================================
-- Problema real encontrado (auditado via Supabase MCP, consulta direta
-- ao banco de producao): a trigger de capacidade (trg_capacity_check)
-- so existe em reservation_passengers. Ela protege criacao de reserva,
-- confirmacao, e o rpc_move_reservation (que forca manualmente um touch
-- em reservation_passengers para reavaliar). MAS qualquer edicao que
-- mude reservations.trip_id por outro caminho -- um UPDATE direto via
-- PostgREST, uma funcao futura, uma correcao manual -- nao passava por
-- NENHUMA validacao de capacidade, porque a trigger nao existia na
-- propria tabela reservations.
--
-- Correcao: trigger independente em reservations, disparada sempre que
-- trip_id mudar, que trava a viagem de destino e revalida a soma de
-- passageiros ocupando vaga daquela reserva contra a capacidade real --
-- sem depender de nenhuma outra funcao "lembrar" de checar.
--
-- Aplicada e testada em producao em 2026-09-02 via Supabase MCP: teste
-- dentro de transacao revertida (BEGIN...ROLLBACK, nenhum dado real
-- alterado) confirmou o bloqueio correto de uma tentativa de mover uma
-- reserva de 3 passageiros para uma viagem de teste com 1 vaga so.
-- =====================================================================

create or replace function fn_check_trip_capacity_on_reservation_move()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_capacity  int;
  v_occupied  int;
  v_new_qty   int;
begin
  -- trip_id nao mudou: nada a validar aqui (mudanca de status de passageiro
  -- ja e coberta por trg_capacity_check em reservation_passengers)
  if NEW.trip_id is not distinct from OLD.trip_id then
    return NEW;
  end if;

  -- reserva sem viagem (frete/encomenda/pendente ainda nao vinculada): nada a validar
  if NEW.trip_id is null then
    return NEW;
  end if;

  -- quantos passageiros DESTA reserva ja ocupam vaga de fato
  select count(*) into v_new_qty
    from reservation_passengers
    where reservation_id = NEW.id and status in ('confirmado', 'embarcado');

  if v_new_qty = 0 then
    return NEW; -- reserva ainda sem passageiro ocupando vaga (ex.: pendente) -- nada a checar agora
  end if;

  -- trava a viagem de DESTINO -- serializa contra qualquer outra reserva
  -- concorrente disputando a mesma viagem, mesma garantia da trigger original
  select capacity into v_capacity from trips where id = NEW.trip_id for update;
  if v_capacity is null then
    raise exception 'Viagem % nao encontrada para checagem de capacidade', NEW.trip_id
      using errcode = 'P0001';
  end if;

  select count(*) into v_occupied
    from reservation_passengers rp
    join reservations r2 on r2.id = rp.reservation_id
    where r2.trip_id = NEW.trip_id
      and rp.status in ('confirmado', 'embarcado')
      and r2.id <> NEW.id;

  if v_occupied + v_new_qty > v_capacity then
    raise exception 'CAPACIDADE_EXCEDIDA: viagem de destino ja tem % de % lugares ocupados (precisa de % vaga(s))'
      , v_occupied, v_capacity, v_new_qty
      using errcode = 'P0001', hint = 'Ofereca lista de espera ao cliente.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_capacity_on_reservation_move on reservations;
create trigger trg_check_capacity_on_reservation_move
  before update of trip_id on reservations
  for each row execute function fn_check_trip_capacity_on_reservation_move();
