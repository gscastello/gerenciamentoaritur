-- =====================================================================
-- ROTA PIRAPEMAS — 98: RASCUNHO DE RESERVA QUE JÁ FOI RESERVADA (#357)
-- =====================================================================
-- Rodar depois de 01–97. Idempotente.
-- O gatilho de 72 (fn_fechar_rascunho_ao_reservar) fecha o rascunho quando a
-- RESERVA é gravada. Se a reserva nasce ANTES do rascunho (a equipe lançou
-- enquanto o bot ainda lia a conversa — caso real: 4 s antes), o rascunho
-- chegava depois e ficava em "Reservas prontas para lançar" para sempre.
-- Agora o próprio rascunho confere ao ser gravado: já existe reserva ativa do
-- mesmo cliente/telefone, no mesmo dia, sentido e tipo → nasce 'lancada',
-- ligado a ela. Nada é apagado.
-- =====================================================================

create or replace function public.fn_rascunho_ja_reservado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reserva uuid;
begin
  if new.status <> 'pronta' or new.trip_date is null or new.direction is null then
    return new;
  end if;
  select r.id into v_reserva
    from reservations r
    join trips t on t.id = r.trip_id
   where r.deleted_at is null
     and r.status <> 'cancelada'
     and t.trip_date = new.trip_date
     and t.direction::text = new.direction::text
     and r.type::text = coalesce(new.type::text, 'passagem')
     and (r.customer_id = new.customer_id
          or (new.phone is not null and r.customer_id = fn_cliente_por_telefone(new.phone)))
   order by r.created_at desc
   limit 1;
  if v_reserva is not null then
    new.status := 'lancada';
    new.reservation_id := v_reserva;
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
exception when others then
  return new; -- nunca impede o bot de gravar o rascunho
end $$;
revoke all on function public.fn_rascunho_ja_reservado() from public, anon, authenticated;

drop trigger if exists trg_reservation_drafts_ja_reservado on public.reservation_drafts;
create trigger trg_reservation_drafts_ja_reservado
  before insert or update of status, trip_date, direction, phone, customer_id, type
  on public.reservation_drafts
  for each row execute function public.fn_rascunho_ja_reservado();

-- fecha os que já estão nessa situação (o gatilho roda no "update" de status)
update public.reservation_drafts set status = 'pronta' where status = 'pronta';

-- trava: um rascunho pronto com reserva igual não pode sobrar
do $$ begin
  if exists (
    select 1 from reservation_drafts d
      join reservations r on r.deleted_at is null and r.status <> 'cancelada'
       and r.type::text = coalesce(d.type::text, 'passagem')
       and (r.customer_id = d.customer_id or (d.phone is not null and r.customer_id = fn_cliente_por_telefone(d.phone)))
      join trips t on t.id = r.trip_id and t.trip_date = d.trip_date and t.direction::text = d.direction::text
     where d.status = 'pronta'
  ) then
    raise exception '98: ainda há rascunho pronto com reserva já feita';
  end if;
end $$;
