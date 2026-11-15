-- 112 — Cancelar a reserva não pode apagar quantas passagens ela tinha (issue #419)
--
-- O gatilho trg_sync_quantity recalcula reservations.quantity pelos passageiros ativos. Ao cancelar,
-- todos os passageiros ficam 'cancelado' e a conta virava greatest(1, 0) = 1: a reserva de 5
-- passagens cancelada aparecia como 1 (e o histórico, o Acerto do bot e a avaliação liam errado).
-- Agora, sem nenhum passageiro ativo, a quantidade fica a que estava.

create or replace function public.fn_sync_reservation_quantity()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid := coalesce(NEW.reservation_id, OLD.reservation_id);
  v_ativos integer;
begin
  select count(*) into v_ativos
    from reservation_passengers
   where reservation_id = v_id
     and status <> 'cancelado';
  if v_ativos > 0 then
    update reservations set quantity = v_ativos where id = v_id and quantity is distinct from v_ativos;
  end if;
  return null;
end;
$function$;
