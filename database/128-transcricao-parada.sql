-- 128-transcricao-parada.sql — issue #480
--
-- 22/11: o crédito do Captain (a IA do Chatwoot) acabou às 13 h e o Chatwoot parou de transcrever
-- os áudios. Ninguém ficou sabendo: o bot via "[áudio sem transcrição]", não achava o dia e o
-- Agendado travava. Agora, de 10 em 10 minutos: 5 ou mais áudios nas últimas 2 h (com mais de 5 min,
-- tempo da transcrição chegar) e nenhum transcrito → abre UMA pendência "Chatwoot não está
-- transcrevendo os áudios" (o sino toca). Voltou a transcrever → a pendência fecha sozinha.

create or replace function public.fn_avisar_transcricao_parada()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sem int;
  v_com int;
  v_aberta uuid;
begin
  select count(*) filter (where content like '%[áudio sem transcrição%'),
         count(*) filter (where content like '%[áudio:%')
    into v_sem, v_com
    from bot_observations
   where author in ('cliente', 'equipe')
     and created_at between now() - interval '2 hours' and now() - interval '5 minutes'
     and (content like '%[áudio sem transcrição%' or content like '%[áudio:%');
  select id into v_aberta from support_tickets
   where status = 'aberta' and subject = 'Chatwoot não está transcrevendo os áudios' limit 1;

  if v_sem >= 5 and v_com = 0 and v_aberta is null then
    perform rpc_open_support_ticket(
      p_subject => 'Chatwoot não está transcrevendo os áudios',
      p_detail => format('%s áudios nas últimas 2 horas chegaram sem texto. O bot não ouve áudio: o dia e o endereço que estão nele não entram na leitura do Agendado. Confira em Chatwoot → Configurações → Cobrança se o crédito do Captain acabou, e ouça os áudios no WhatsApp até voltar.', v_sem),
      p_phone => null,
      p_customer_id => null,
      p_source => 'sistema',
      p_meta => jsonb_build_object('transcricao_parada', true));
    return jsonb_build_object('aberta', true, 'sem', v_sem);
  end if;

  if v_aberta is not null and v_com > 0 then
    update support_tickets set status = 'resolvida', resolved_at = now(),
           meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'transcricao_voltou')
     where id = v_aberta;
    return jsonb_build_object('fechada', true, 'com', v_com);
  end if;
  return jsonb_build_object('sem', v_sem, 'com', v_com);
end;
$function$;
revoke all on function public.fn_avisar_transcricao_parada() from public, anon, authenticated;

-- roda junto com as que fecham pendências, de 10 em 10 minutos
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fechar-pendencias-resolvidas';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('fechar-pendencias-resolvidas', '*/10 * * * *',
    'select public.fn_fechar_pendencias_resolvidas(); select public.fn_fechar_pendencias_ja_resolvidas(); select public.fn_avisar_transcricao_parada();');
end $$;
