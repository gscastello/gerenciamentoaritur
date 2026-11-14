-- 109 — Correção de reserva em até ~2 minutos (issue #410)
--
-- O dono achou longo esperar 5 min pela rodada + 3 min depois da reserva (até ~8 min). Agora:
--   - a rotina roda a cada MINUTO;
--   - a reserva nova espera 1 min (o Agendado já leu na hora) e o cliente que ainda está
--     escrevendo espera 45 s sem mensagem nova (não revisa no meio do pedido picado);
--   - "andamento": a revisão marca o passageiro ao começar, para duas rodadas seguidas não
--     revisarem o mesmo cliente ao mesmo tempo (custo em dobro e duas mensagens ao cliente).
--     Marca com mais de 5 min (rodada que caiu) não segura mais ninguém.
-- O "Atualizado ☑️" da equipe revisa na hora, sem esperar a rotina (Edge Function chatwoot-bot).

alter table public.revisoes_reservas drop constraint if exists revisoes_reservas_resultado_check;
alter table public.revisoes_reservas
  add constraint revisoes_reservas_resultado_check
  check (resultado = any (array['ok', 'corrigida', 'pendencia', 'erro', 'andamento']));

create or replace function public.fn_clientes_para_revisar(p_limite integer default 6)
returns table(customer_id uuid, assinatura text, proxima date)
language sql
stable security definer
set search_path to 'public'
as $function$
  with futuras as (
    select r.customer_id, min(t.trip_date) proxima, max(r.created_at) ultima_criada
    from reservations r join trips t on t.id = r.trip_id
    where r.deleted_at is null and r.status in ('confirmada', 'pendente') and r.customer_id is not null
      and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
    group by r.customer_id
  ),
  com_assinatura as (
    select f.customer_id, f.proxima, f.ultima_criada, fn_assinatura_revisao(f.customer_id) assinatura,
           (select max(o.created_at)
              from bot_observations o
              join whatsapp_conversations w on w.id = o.conversation_id
              join customers c on c.id = f.customer_id
             where w.deleted_at is null and w.telefone_variantes && fn_variantes_telefone(c.phone)
               and o.author in ('cliente', 'equipe')) ultima_mensagem
    from futuras f
  )
  select a.customer_id, a.assinatura, a.proxima
  from com_assinatura a
  where a.ultima_criada < now() - interval '1 minute'
    and (a.ultima_mensagem is null or a.ultima_mensagem < now() - interval '45 seconds')
    -- já revisado com esta assinatura (o que mudou depois muda a assinatura)
    and not exists (select 1 from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura
                    and v.resultado not in ('erro', 'andamento'))
    -- outra rodada está revisando agora
    and not exists (select 1 from revisoes_reservas v where v.customer_id = a.customer_id and v.resultado = 'andamento'
                    and v.revisado_em > now() - interval '5 minutes')
    and (select count(*) from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura and v.resultado = 'erro') < 2
  order by a.proxima, a.ultima_criada
  limit greatest(1, least(coalesce(p_limite, 6), 30))
$function$;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'revisar-reservas';
  if v_job is null then
    raise exception 'job revisar-reservas não existe (rode a 97 antes)';
  end if;
  perform cron.alter_job(v_job, schedule := '* * * * *');
end $$;
