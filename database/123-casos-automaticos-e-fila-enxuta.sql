-- 123-casos-automaticos-e-fila-enxuta.sql — issues #463 e #464
--
-- #463 — o banco de casos reais cresce sozinho:
--   · 03:00 (São Luís): fn_gerar_casos_bot() transforma cada "Agendado ☑️" novo em caso.
--   · 03:00–06:50, de 10 em 10 min: avaliar-bot na rodada fixa "auto" (avalia só os casos que
--     ainda não foram avaliados nela, ou seja, os novos).
--   · 07:30: fn_avisar_erros_do_bot() — caso novo "errado" ou "faltou" vira UMA pendência
--     "Bot errou em casos reais", com a conversa e a diferença, para conferir e virar regra.
-- #464 — fila enxuta: pendência "Revisão: conferir reserva" com mais de 3 dias e "Pedido sem
--   reserva" com mais de 4 dias fecham sozinhas (a viagem já passou), marcadas como vencidas.
--   Nada é apagado; o "Agendado ☑️ não lançou" continua até alguém resolver.

create or replace function public.fn_avisar_erros_do_bot()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_linhas text;
  v_n int;
begin
  select count(*), string_agg('conversa ' || c.chatwoot_conversation_id || ': ' || array_to_string(array(select jsonb_array_elements_text(a.diferencas)), '; '), E'\n' order by a.criado_em)
    into v_n, v_linhas
    from bot_avaliacoes a
    join bot_casos c on c.id = a.caso_id
   where a.rodada = 'auto'
     and a.resultado in ('errado', 'faltou')
     and a.criado_em > now() - interval '24 hours'
     and c.ativo;
  if coalesce(v_n, 0) = 0 then
    return;
  end if;
  insert into support_tickets (source, subject, detail, status, meta)
  values ('sistema', 'Bot errou em casos reais',
          v_n || ' caso(s) real(is) novo(s) em que a leitura do Agendado não bate com a reserva que ficou. Confira se foi erro do bot (vira regra e teste) ou mudança do cliente depois:' || E'\n' || left(v_linhas, 3000),
          'aberta', jsonb_build_object('rodada', 'auto', 'dia', (now() at time zone 'America/Fortaleza')::date));
end;
$function$;
revoke all on function public.fn_avisar_erros_do_bot() from public, anon, authenticated;

create or replace function public.fn_fechar_pendencias_vencidas()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  update support_tickets
     set status = 'resolvida', resolved_at = now(),
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'vencida')
   where status = 'aberta'
     and ((subject = 'Revisão: conferir reserva' and created_at < now() - interval '3 days')
       or (subject = 'Pedido sem reserva' and created_at < now() - interval '4 days'));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.fn_fechar_pendencias_vencidas() from public, anon, authenticated;

do $$
declare
  v_job bigint;
  v_cmd text := $cmd$
      select net.http_post(
        url := 'https://szwnsacgpsvioswrelqo.supabase.co/functions/v1/avaliar-bot',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rotina_revisor_token')
        ),
        body := '{"rodada":"auto","limite":10}'::jsonb,
        timeout_milliseconds := 5000
      );
    $cmd$;
begin
  for v_job in select jobid from cron.job where jobname in ('casos-do-bot-gerar', 'casos-do-bot-avaliar', 'casos-do-bot-avisar', 'fechar-pendencias-vencidas') loop
    perform cron.unschedule(v_job);
  end loop;
  -- horários em UTC (São Luís = UTC−3)
  perform cron.schedule('casos-do-bot-gerar', '0 6 * * *', 'select public.fn_gerar_casos_bot();');
  perform cron.schedule('casos-do-bot-avaliar', '*/10 6-9 * * *', v_cmd);
  perform cron.schedule('casos-do-bot-avisar', '30 10 * * *', 'select public.fn_avisar_erros_do_bot();');
  perform cron.schedule('fechar-pendencias-vencidas', '15 9 * * *', 'select public.fn_fechar_pendencias_vencidas();');
end $$;
