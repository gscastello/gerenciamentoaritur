-- 120-agendado-fecha-pendencia.sql — issue #455
--
-- Quando o "Agendado ☑️" não lança, abre uma pendência ("Agendado ☑️ não lançou" ou "… lançou só
-- parte"). Se a equipe lança a reserva à mão (Agenda, assistente, /agendar), a pendência ficava
-- aberta à toa (4 em 17/11) e tirava a força do aviso. Agora o mesmo gatilho que fecha o rascunho
-- (fn_fechar_rascunho_ao_reservar) também resolve a pendência do Agendado daquele passageiro:
--   · só pendência aberta do Agendado, aberta ANTES da reserva e nos últimos 7 dias;
--   · mesmo passageiro (cadastro ou telefone, com e sem o nono dígito);
--   · viagem do dia da pendência até 7 dias depois (uma reserva de outra semana não fecha);
--   · fica o registro: quem resolveu e a reserva que resolveu (meta.resolvida_pela_reserva).
-- Reserva cancelada ou apagada não fecha nada. Erro aqui nunca impede a reserva.

create or replace function public.fn_fechar_rascunho_ao_reservar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data   date;
  v_dir    trip_direction;
  v_fone   text;
begin
  if new.trip_id is null or new.deleted_at is not null or new.status = 'cancelada' then
    return new;
  end if;
  select t.trip_date, t.direction into v_data, v_dir from trips t where t.id = new.trip_id;
  select c.phone into v_fone from customers c where c.id = new.customer_id;

  update reservation_drafts d
     set status = 'lancada', reservation_id = new.id,
         resolved_by = coalesce(auth.uid(), new.created_by), resolved_at = now()
   where d.status = 'pronta'
     and d.trip_date = v_data
     and d.direction = v_dir
     and (d.customer_id = new.customer_id
          or (v_fone is not null and d.phone = any(fn_variantes_telefone(v_fone))));

  -- a pendência do "Agendado ☑️" daquele passageiro se resolve com a reserva (issue #455)
  update support_tickets s
     set status = 'resolvida', resolved_at = now(),
         resolved_by = coalesce(auth.uid(), new.created_by),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_pela_reserva', new.id)
   where s.status = 'aberta'
     and s.subject like 'Agendado ☑️%'
     and s.created_at < coalesce(new.created_at, now())
     and s.created_at > now() - interval '7 days'
     and v_data between (s.created_at at time zone 'America/Fortaleza')::date
                    and (s.created_at at time zone 'America/Fortaleza')::date + 7
     and (s.customer_id = new.customer_id
          or (v_fone is not null and fn_normalizar_telefone(s.phone) = any(fn_variantes_telefone(v_fone))));
  return new;
exception when others then
  return new;
end;
$function$;
