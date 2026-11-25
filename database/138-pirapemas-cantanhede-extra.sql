-- =====================================================================
-- ROTA PIRAPEMAS — 138: passageiro de Pirapemas até Cantanhede é sempre extra (#530)
-- =====================================================================
-- Rodar depois de 01–137. Idempotente.
-- Dono, 24/11/2026: quem embarca em Pirapemas e desce em Cantanhede (Volta) não ocupa vaga. A marca é a das
-- passagens extras (61): extra_data.fora_lotacao = true, com extra_automatico para saber que não foi à mão.
--   * vale para todo caminho que cria ou edita a reserva (app, Agendado, atendente de IA, Assistente);
--   * se o desembarque ou o ponto mudar e deixar de ser esse trecho, a marca automática sai; a que a equipe
--     pôs à mão nunca é mexida;
--   * não altera reservas que já existem;
--   * a trava da autonomia (132) não conta vaga para passagem extra; vendas fechadas continuam barrando o bot.
-- =====================================================================

create or replace function public.fn_trecho_sempre_extra(p_direction trip_direction, p_ponto text, p_area text, p_desembarque text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select p_direction = 'volta' and p_ponto = 'pirapemas'
     and (p_area = 'cantanhede'
          or (p_area is null and coalesce(p_desembarque, '') ~* '\mcant?anhede\M' and coalesce(p_desembarque, '') !~* 's[ãa]o lu[ií]s'));
$$;
revoke all on function public.fn_trecho_sempre_extra(trip_direction, text, text, text) from public, anon;

create or replace function public.fn_marcar_trecho_extra()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_dir trip_direction;
  v_ponto text;
  v_extra boolean;
begin
  if new.type <> 'passagem' or new.trip_id is null then
    return new;
  end if;
  select direction into v_dir from trips where id = new.trip_id;
  select code into v_ponto from route_points where id = new.route_point_id;
  v_extra := coalesce(fn_trecho_sempre_extra(v_dir, v_ponto, nullif(new.dropoff_area, ''), new.dropoff_location), false);
  if v_extra and not fn_is_extra(new.extra_data) then
    new.extra_data := coalesce(new.extra_data, '{}'::jsonb) || '{"fora_lotacao": true, "extra_automatico": true}'::jsonb;
  elsif not v_extra and coalesce(new.extra_data ->> 'extra_automatico', '') = 'true' then
    new.extra_data := new.extra_data - 'fora_lotacao' - 'extra_automatico';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_marcar_trecho_extra() from public, anon, authenticated;

drop trigger if exists trg_a_reservations_trecho_extra on public.reservations;
create trigger trg_a_reservations_trecho_extra
  before insert or update of dropoff_area, dropoff_location, route_point_id, trip_id on public.reservations
  for each row execute function public.fn_marcar_trecho_extra();

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
  -- passagem extra não ocupa vaga (issue #530)
  if fn_is_extra(new.extra_data) then
    return new;
  end if;
  if (v->>'available')::int < new.quantity then
    raise exception 'SEM_VAGA_PARA_O_BOT: só % vaga(s) que o bot pode vender nessa viagem%.', v->>'available',
      case when (v->>'confirmado')::boolean then '' else ' (veículo do dia não confirmado)' end using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
revoke all on function public.fn_trava_da_autonomia() from public, anon, authenticated;
