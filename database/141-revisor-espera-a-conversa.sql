-- 141 — O revisor espera a conversa assentar quando a viagem está longe (issue #537, redução de custos, dono 25/11)
--
-- Cada leitura do revisor é paga. Ele relia 45 segundos depois de cada mensagem, e a mesma conversa era lida 2 ou 3 vezes
-- em poucos minutos. Com a viagem a mais de 2 horas, espera 6 minutos sem mensagem nova; perto da saída, ou depois dela,
-- continua em 45 segundos. Saída mais cedo de cada sentido: Ida 03:00, Volta 11:30 (Fortaleza). Nada deixa de ser revisado.
create or replace function public.fn_clientes_para_revisar(p_limite integer default 6)
returns table(customer_id uuid, assinatura text, proxima date)
language sql
stable security definer
set search_path to 'public'
as $function$
  with futuras as (
    select r.customer_id, min(t.trip_date) proxima, max(r.created_at) ultima_criada,
           -- saída da viagem mais próxima (já passou = continua em 45 segundos)
           min((t.trip_date + case when t.direction = 'ida' then time '03:00' else time '11:30' end) at time zone 'America/Fortaleza') saida
    from reservations r join trips t on t.id = r.trip_id
    where r.deleted_at is null and r.status in ('confirmada', 'pendente') and r.customer_id is not null
      and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
    group by r.customer_id
  ),
  com_assinatura as (
    select f.customer_id, f.proxima, f.ultima_criada, f.saida, fn_assinatura_revisao(f.customer_id) assinatura,
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
    and (a.ultima_mensagem is null
         or a.ultima_mensagem < now() - case when a.saida > now() + interval '2 hours' then interval '6 minutes' else interval '45 seconds' end)
    and not exists (select 1 from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura
                    and v.resultado not in ('erro', 'andamento'))
    and not exists (select 1 from revisoes_reservas v where v.customer_id = a.customer_id and v.resultado = 'andamento'
                    and v.revisado_em > now() - interval '5 minutes')
    and (select count(*) from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura and v.resultado = 'erro') < 2
  order by a.proxima, a.ultima_criada
  limit greatest(1, least(coalesce(p_limite, 6), 30))
$function$;

revoke all on function public.fn_clientes_para_revisar(integer) from public, anon, authenticated;
grant execute on function public.fn_clientes_para_revisar(integer) to service_role;

-- Aprendizado 1 vez por dia (era a cada 6 h): vale já, mesmo para a versão do bot que ainda pede 6 horas.
create or replace function public.fn_bot_learning_try_start(p_min_hours integer default 24)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_n integer;
begin
  update settings
     set value = jsonb_build_object('last_run_at', now())
   where key = 'bot_learning_state'
     and (value ->> 'last_run_at')::timestamptz < now() - make_interval(hours => greatest(p_min_hours, 24));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;
revoke all on function public.fn_bot_learning_try_start(integer) from public, anon, authenticated;
grant execute on function public.fn_bot_learning_try_start(integer) to service_role;
