-- 125-pendencias-ja-resolvidas.sql — issue #472
--
-- A faixa da Agenda mostrava pendências que já estavam resolvidas (o dono, 19/11):
--   · passageiro JÁ reservado que só mandou "Aguardando" / "Está tudo certo": a sentinela comparava
--     a reserva com a ÚLTIMA mensagem do cliente, não com o último PEDIDO, e abria "Pedido sem reserva";
--   · a equipe perguntou o endereço (ou o cliente disse que manda depois): não há o que lançar ainda;
--   · a viagem de hoje já saiu: só fechava no dia seguinte;
--   · "Agendado ☑️ lançou só parte" que o revisor já releu depois sem achar nada: ficava 3 dias.
-- Nada é apagado: a pendência fica no histórico como resolvida, com o motivo em meta.resolvida_por.

-- Mensagem do cliente que pede vaga (a mesma regra que a sentinela usava dentro da consulta).
create or replace function public.fn_eh_pedido_de_vaga(p_texto text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(p_texto, '') ~* '(tem vaga|tem lugar|uma vaga|vaga pra|vaga para|guard[ae] (uma |minha )?vaga|deix[ae] (uma |minha )?vaga|marca[r]? (uma |minha )?(vaga|passagem)|reserv|agend|quero (ir|viajar|uma passagem)|passage(m|ns) pra|passage(m|ns) para|vou (amanh|hoje|segunda|ter[cç]a|quarta|quinta|sexta|s[áa]bado|domingo))';
$function$;

-- A conversa está esperando o CLIENTE? A última mensagem é da equipe pedindo um dado (endereço, dia,
-- nome…), ou o cliente disse que manda depois e a equipe só respondeu "ok". Quando ele responder, a
-- sentinela olha de novo. "Ok" sozinho da equipe depois de um pedido NÃO é esperar o cliente.
create or replace function public.fn_conversa_aguarda_cliente(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with u as (
    select author, content, created_at
      from bot_observations
     where conversation_id = p_conversa and author in ('cliente', 'equipe')
       and created_at > now() - interval '72 hours'
  ),
  ultima as (select author, content from u order by created_at desc limit 1),
  ultima_do_cliente as (select content, created_at from u where author = 'cliente' order by created_at desc limit 1)
  select coalesce((
           select l.author = 'equipe'
              and l.content ~* '(endere[cç]o|onde|aonde|bairro|buscar|saindo d|que dia|qual dia|pra quando|para quando|quantas|seu nome|nome complet|cidade|refer[eê]ncia)'
              and (l.content ~ '\?\s*$' or l.content ~* '^\s*(qual|quais|onde|aonde|de onde|quantas|que dia|me (manda|mande|passa|envia|informa)|pode (me )?(mandar|enviar|passar|informar)|saindo)')
             from ultima l), false)
      or coalesce((
           select c.content ~* '((lhe|te|j[áa]) (envio|mando)|mando (depois|mais tarde|j[áa])|assim que (eu )?(chegar|puder|tiver)|vou (te |lhe )?(mandar|enviar))'
              and not exists (select 1 from u where u.author = 'equipe' and u.created_at > c.created_at
                                and u.content !~* '^\s*(ok|okay|t[áa]|certo|beleza|blz|combinado|tudo bem|aguardo)[.!👍 ]*$')
             from ultima_do_cliente c), false);
$function$;
revoke all on function public.fn_conversa_aguarda_cliente(uuid) from public, anon, authenticated;

-- Sentinela: o pedido está atendido quando há reserva lançada depois do último PEDIDO do cliente
-- (não da última mensagem); conversa esperando o cliente não é candidata.
create or replace function public.fn_conversas_para_sentinela(p_limite integer default 6)
returns table(conversation_id uuid, chatwoot_conversation_id bigint, telefone text, ultima_msg_id bigint, assinatura text)
language sql
security definer
set search_path to 'public'
as $function$
  with janela as (
    select o.conversation_id,
           max(o.created_at) as ultima_em,
           max(o.created_at) filter (where o.author = 'cliente') as ultima_do_cliente,
           max(o.created_at) filter (where o.author = 'cliente' and fn_eh_pedido_de_vaga(o.content)) as ultimo_pedido_em,
           max(o.chatwoot_message_id) as ultima_id,
           max(o.chatwoot_message_id) filter (where o.author = 'cliente') as ultima_id_cliente,
           bool_or(
             (o.author = 'cliente' and fn_eh_pedido_de_vaga(o.content))
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
     and j.ultima_em < now() - interval '30 minutes'
     and w.chatwoot_conversation_id is not null
     and not exists (
       select 1 from sentinela_pedidos s
        where s.conversation_id = j.conversation_id
          and s.assinatura = coalesce(j.ultima_id::text, '') || '@' || to_char(j.ultima_em, 'YYYYMMDDHH24MISS'))
     and not exists (
       select 1 from reservations r join customers c on c.id = r.customer_id
        where r.deleted_at is null and r.status <> 'cancelada'
          and r.created_at > coalesce(j.ultimo_pedido_em, j.ultima_do_cliente) - interval '10 minutes'
          and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(w.phone)))
     and not fn_conversa_aguarda_cliente(j.conversation_id)
     and not exists (
       select 1 from support_tickets t
        where t.status = 'aberta'
          and t.meta->>'conversation_id' = j.conversation_id::text
          and (t.subject like 'Agendado ☑️%' or t.subject like 'Pedido sem reserva%'))
   order by j.ultima_em desc
   limit greatest(1, least(coalesce(p_limite, 6), 20));
$function$;
revoke all on function public.fn_conversas_para_sentinela(integer) from public, anon, authenticated;

-- As regras novas de fechamento. Ficam numa função à parte, chamada no fim da de #467.
create or replace function public.fn_fechar_pendencias_ja_resolvidas()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agora timestamp := now() at time zone 'America/Fortaleza';
  v_hoje date := v_agora::date;
  v_out jsonb := '{}'::jsonb;
  v_n int;
begin
  drop table if exists _pend2;
  create temp table _pend2 on commit drop as
    select t.id, t.subject, t.created_at, t.meta, coalesce(nullif(t.phone, ''), w.phone) as fone, w.id as conversa
      from support_tickets t
      left join whatsapp_conversations w on w.id::text = t.meta->>'conversation_id'
     where t.status = 'aberta' and (t.subject = 'Pedido sem reserva' or t.subject like 'Agendado ☑️%');

  -- Pedido sem reserva: o passageiro já tem reserva lançada depois do último pedido dele
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'ja_reservado')
    from _pend2 p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Pedido sem reserva' and p.fone is not null
     and exists (
       select 1 from reservations r join customers c on c.id = r.customer_id
        where r.deleted_at is null and r.status <> 'cancelada'
          and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(p.fone))
          and r.created_at > (select max(o.created_at) from bot_observations o
                               where o.conversation_id = p.conversa and o.author = 'cliente'
                                 and o.created_at <= p.created_at and fn_eh_pedido_de_vaga(o.content)) - interval '10 minutes');
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('pedido_ja_reservado', v_n);

  -- Pedido sem reserva: a conversa espera o cliente (a sentinela olha de novo quando ele responder)
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'aguardando_cliente')
    from _pend2 p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Pedido sem reserva' and p.conversa is not null
     and fn_conversa_aguarda_cliente(p.conversa);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('pedido_aguardando_cliente', v_n);

  -- Pedido sem reserva: todas as viagens pedidas já saíram (hoje conta depois da saída: Ida 08 h, Volta 15 h)
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'viagem_passou')
    from _pend2 p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Pedido sem reserva'
     and jsonb_array_length(coalesce(p.meta->'pedidos', '[]'::jsonb)) > 0
     and not exists (
       select 1 from jsonb_array_elements(p.meta->'pedidos') x
        where (x->>'data')::date > v_hoje
           or ((x->>'data')::date = v_hoje
               and v_agora::time < (case when x->>'direcao' = 'ida' then time '08:00' else time '15:00' end)));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('pedido_viagem_de_hoje_saiu', v_n);

  -- Agendado lançou só parte: o revisor releu a conversa do passageiro depois e não achou o que fazer
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'revisor_conferiu')
    from _pend2 p
   where s.id = p.id and s.status = 'aberta' and p.subject like 'Agendado ☑️ lançou só parte%' and p.fone is not null
     and exists (
       select 1 from revisoes_reservas rv join customers c on c.id = rv.customer_id
        where fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(p.fone))
          and rv.revisado_em > p.created_at + interval '1 minute'
          and rv.resultado in ('ok', 'corrigida'));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('parte_revisor_conferiu', v_n);

  return v_out;
end;
$function$;
revoke all on function public.fn_fechar_pendencias_ja_resolvidas() from public, anon, authenticated;

-- roda junto com a de #467, de 10 em 10 minutos
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fechar-pendencias-resolvidas';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('fechar-pendencias-resolvidas', '*/10 * * * *',
    'select public.fn_fechar_pendencias_resolvidas(); select public.fn_fechar_pendencias_ja_resolvidas();');
end $$;
