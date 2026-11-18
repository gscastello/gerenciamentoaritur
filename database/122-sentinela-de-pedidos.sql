-- 122-sentinela-de-pedidos.sql — issue #461
--
-- Sentinela de pedido sem reserva (Edge Function sentinela-pedidos, regras em
-- supabase/functions/_shared/sentinelaPura.ts). De 10 em 10 minutos ela olha as conversas com
-- pedido de vaga nas últimas 72 h e simula o Agendado ("se a equipe marcasse agora, o que seria
-- lançado?"). Viagem pedida e sem reserva → pendência "Pedido sem reserva" + nota no Chatwoot.
--
-- 1. sentinela_pedidos: a última leitura de cada conversa (assinatura = última mensagem), para
--    reler só quando a conversa muda. Só o servidor (service_role) mexe; sem grant para o app.
-- 2. fn_conversas_para_sentinela(p_limite): as conversas candidatas.
-- 3. O gatilho que fecha a pendência ao lançar a reserva (database/120) passa a fechar também a
--    "Pedido sem reserva" do mesmo passageiro.

create table if not exists public.sentinela_pedidos (
  conversation_id uuid primary key references public.whatsapp_conversations(id) on delete cascade,
  assinatura      text not null,
  resultado       text not null,
  detalhe         jsonb not null default '{}'::jsonb,
  verificado_em   timestamptz not null default now()
);
alter table public.sentinela_pedidos enable row level security;
revoke all on public.sentinela_pedidos from anon, authenticated;

create or replace function public.fn_conversas_para_sentinela(p_limite int default 6)
returns table (conversation_id uuid, chatwoot_conversation_id bigint, telefone text, ultima_msg_id bigint, assinatura text)
language sql
security definer
set search_path to 'public'
as $function$
  with janela as (
    select o.conversation_id,
           max(o.created_at) as ultima_em,
           max(o.created_at) filter (where o.author = 'cliente') as ultima_do_cliente,
           max(o.chatwoot_message_id) as ultima_id,
           max(o.chatwoot_message_id) filter (where o.author = 'cliente') as ultima_id_cliente,
           bool_or(
             (o.author = 'cliente' and o.content ~* '(tem vaga|tem lugar|uma vaga|vaga pra|vaga para|guard[ae] (uma |minha )?vaga|deix[ae] (uma |minha )?vaga|marca[r]? (uma |minha )?(vaga|passagem)|reserv|agend|quero (ir|viajar|uma passagem)|passage(m|ns) pra|passage(m|ns) para|vou (amanh|hoje|segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|domingo))')
             or (o.author = 'equipe' and o.content ~* '\m(agendad[oa]|agendei|marquei|reservad[oa])' and o.content !~ '(☑|✅|✔)' and o.content !~ '\?')
           ) as tem_pedido
      from bot_observations o
     where o.created_at > now() - interval '72 hours'
       and o.author in ('cliente', 'equipe')
       and o.conversation_id is not null
     group by o.conversation_id
  )
  select j.conversation_id, w.chatwoot_conversation_id::bigint, w.phone,
         coalesce(j.ultima_id_cliente, j.ultima_id)::bigint,
         coalesce(j.ultima_id::text, '') || '@' || to_char(j.ultima_em, 'YYYYMMDDHH24MISS')
    from janela j
    join whatsapp_conversations w on w.id = j.conversation_id and w.deleted_at is null
   where j.tem_pedido
     and j.ultima_do_cliente is not null
     -- dá tempo à equipe: a conversa parada há 30 min ou mais
     and j.ultima_em < now() - interval '30 minutes'
     and w.chatwoot_conversation_id is not null
     and not exists (
       select 1 from sentinela_pedidos s
        where s.conversation_id = j.conversation_id
          and s.assinatura = coalesce(j.ultima_id::text, '') || '@' || to_char(j.ultima_em, 'YYYYMMDDHH24MISS'))
     -- a equipe já lançou reserva do passageiro depois da última mensagem dele: pedido atendido
     and not exists (
       select 1 from reservations r join customers c on c.id = r.customer_id
        where r.deleted_at is null and r.status <> 'cancelada'
          and r.created_at > j.ultima_do_cliente - interval '10 minutes'
          and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(w.phone)))
     and not exists (
       select 1 from support_tickets t
        where t.status = 'aberta'
          and t.meta->>'conversation_id' = j.conversation_id::text
          and (t.subject like 'Agendado ☑️%' or t.subject like 'Pedido sem reserva%'))
   order by j.ultima_em desc
   limit greatest(1, least(coalesce(p_limite, 6), 20));
$function$;
revoke all on function public.fn_conversas_para_sentinela(int) from public, anon, authenticated;

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

  -- a pendência do "Agendado ☑️" (issue #455) ou do "Pedido sem reserva" (issue #461) daquele
  -- passageiro se resolve com a reserva
  update support_tickets s
     set status = 'resolvida', resolved_at = now(),
         resolved_by = coalesce(auth.uid(), new.created_by),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_pela_reserva', new.id)
   where s.status = 'aberta'
     and (s.subject like 'Agendado ☑️%' or s.subject like 'Pedido sem reserva%')
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

-- 4. A rotina: de 10 em 10 minutos, com a chave da rotina do revisor (Vault).
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'sentinela-pedidos';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
  perform cron.schedule(
    'sentinela-pedidos',
    '*/10 * * * *',
    $cmd$
      select net.http_post(
        url := 'https://szwnsacgpsvioswrelqo.supabase.co/functions/v1/sentinela-pedidos',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rotina_revisor_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $cmd$
  );
end $$;
