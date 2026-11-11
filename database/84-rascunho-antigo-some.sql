-- =====================================================================
-- ROTA PIRAPEMAS — 84: RESERVA PRONTA ANTIGA SOME SOZINHA (#286)
-- =====================================================================
-- Rodar depois de 01–83. Idempotente.
-- "Reservas prontas para lançar" acumulava rascunhos de viagens que já passaram
-- (e o "amanhã" de ontem relido hoje). Todo dia, logo depois da meia-noite em
-- São Luís, o que ficou pronto para um dia que já passou é descartado com o motivo.
-- Nada é apagado: o rascunho fica com status 'descartada' (histórico).
-- =====================================================================

create or replace function public.fn_expirar_rascunhos_de_reserva()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update reservation_drafts
     set status = 'descartada',
         resolved_at = now(),
         notes = left(coalesce(notes, '') || ' [Descartada sozinha: a data da viagem já passou]', 300)
   where status = 'pronta'
     and trip_date < (now() at time zone 'America/Fortaleza')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fn_expirar_rascunhos_de_reserva() from public, anon, authenticated;

-- 03:15 UTC = 00:15 em São Luís
do $$ begin
  perform cron.unschedule('expirar-rascunhos-de-reserva')
  where exists (select 1 from cron.job where jobname = 'expirar-rascunhos-de-reserva');
  perform cron.schedule('expirar-rascunhos-de-reserva', '15 3 * * *', $c$ select public.fn_expirar_rascunhos_de_reserva(); $c$);
end $$;

select public.fn_expirar_rascunhos_de_reserva();
