-- 118 — CRM dos passageiros (issue #446, visual v18 aprovado pelo dono em 17/11)
--
-- A tela de Passageiros passa a ter grupos prontos (sumiram, sem pagamento marcado, frequentes,
-- com viagem marcada, novos, sem nome), ordenação e uma ficha com os números de cada um.
--
-- 1. v_customers_stats ganha colunas no FIM (as antigas ficam iguais, na mesma ordem):
--    ultima_viagem  — última viagem feita (até hoje). A ultima_data antiga contava viagem futura.
--    proxima_data   — próxima viagem marcada (confirmada ou pendente, de hoje em diante).
--    primeira_data  — primeira viagem feita.
--    viagens_90d    — viagens feitas nos últimos 90 dias.
--    a_receber / a_receber_qtd — viagem já feita sem pagamento marcado no app.
--    frequente      — 6 viagens ou mais nos últimos 90 dias (uma ida e volta por mês ou mais).
--    novo           — primeira viagem neste mês.
--    sumiu          — viajava (4 viagens ou mais nos 90 dias antes da última) e não viaja há 30 dias.
--    sem_nome       — cadastro sem nome (ou "Passageiro (local)", o nome provisório da anotação).
--    cliente_desde, email, tags, bot_instructions, nota_do_bot (a anotação automática; só admin lê).
--    O "hoje" é o de Fortaleza. A view continua security_invoker (vale o RLS de quem lê).
-- 2. fn_resumo_dos_passageiros(): os números do topo e a quantidade de cada grupo.
-- 3. rpc_conversa_do_passageiro(id): as últimas mensagens do WhatsApp e os avisos enviados, para a
--    aba Conversa da ficha. Security definer porque as observações do bot só o admin lê direto;
--    confere o papel (admin ou atendente) antes de devolver.

create or replace view public.v_customers_stats
with (security_invoker = true) as
with base as (
  select
    c.id as customer_id,
    c.name as nome,
    c.phone as telefone,
    c.notes,
    c.default_neighborhood as bairro_padrao,
    count(r.id) filter (where r.status in ('confirmada', 'embarcado')) as viagens_count,
    coalesce(sum(r.quantity) filter (where r.status in ('confirmada', 'embarcado')), 0)::integer
      as total_passagens,
    count(r.id) filter (where r.status = 'cancelada') as cancelamentos,
    count(r.id) filter (where r.status = 'nao_compareceu') as nao_compareceu,
    coalesce(sum(r.total_price) filter (where r.status in ('confirmada', 'embarcado')), 0::numeric)
      as total_gasto,
    max(t.trip_date) as ultima_data,
    count(r.id) as reservas_total,
    c.default_route_point_code as ponto_padrao,
    c.default_payment_method as pagamento_padrao,
    c.phone_secondary as telefone2,
    max(t.trip_date) filter (
      where r.status in ('confirmada', 'embarcado')
        and t.trip_date <= (now() at time zone 'America/Fortaleza')::date
    ) as ultima_viagem,
    min(t.trip_date) filter (
      where r.status in ('confirmada', 'pendente')
        and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
    ) as proxima_data,
    min(t.trip_date) filter (where r.status in ('confirmada', 'embarcado')) as primeira_data,
    count(r.id) filter (
      where r.status in ('confirmada', 'embarcado')
        and t.trip_date between (now() at time zone 'America/Fortaleza')::date - 90
                            and (now() at time zone 'America/Fortaleza')::date
    )::integer as viagens_90d,
    coalesce(sum(r.total_price) filter (
      where r.status in ('confirmada', 'embarcado')
        and t.trip_date < (now() at time zone 'America/Fortaleza')::date
        and not coalesce(pg.pago, false)
    ), 0::numeric) as a_receber,
    count(r.id) filter (
      where r.status in ('confirmada', 'embarcado')
        and t.trip_date < (now() at time zone 'America/Fortaleza')::date
        and not coalesce(pg.pago, false)
    )::integer as a_receber_qtd,
    c.created_at as cliente_desde,
    c.email::text as email,
    c.tags,
    c.bot_instructions
  from customers c
  left join reservations r
    on r.customer_id = c.id and r.deleted_at is null and r.type = 'passagem'
  left join trips t on t.id = r.trip_id
  left join lateral (
    select bool_or(p.status = 'pago') as pago
    from payments p
    where p.reservation_id = r.id and p.deleted_at is null
  ) pg on true
  where c.deleted_at is null
  group by c.id, c.name, c.phone, c.phone_secondary, c.notes, c.default_neighborhood,
           c.default_route_point_code, c.default_payment_method, c.created_at, c.email, c.tags,
           c.bot_instructions
)
select
  b.customer_id, b.nome, b.telefone, b.notes, b.bairro_padrao, b.viagens_count, b.total_passagens,
  b.cancelamentos, b.nao_compareceu, b.total_gasto, b.ultima_data, b.reservas_total,
  b.ponto_padrao, b.pagamento_padrao, b.telefone2,
  b.ultima_viagem, b.proxima_data, b.primeira_data, b.viagens_90d, b.a_receber, b.a_receber_qtd,
  (b.viagens_90d >= 6) as frequente,
  (b.primeira_data >= date_trunc('month', (now() at time zone 'America/Fortaleza'))::date) as novo,
  case
    when b.ultima_viagem is null
      or b.ultima_viagem >= (now() at time zone 'America/Fortaleza')::date - 30 then false
    else (
      select count(*) >= 4
      from reservations r2
      join trips t2 on t2.id = r2.trip_id
      where r2.customer_id = b.customer_id
        and r2.deleted_at is null
        and r2.type = 'passagem'
        and r2.status in ('confirmada', 'embarcado')
        and t2.trip_date between b.ultima_viagem - 90 and b.ultima_viagem
    )
  end as sumiu,
  (b.nome is null or btrim(b.nome) = '' or b.nome ~* '^passageiro(\s*\(.*\))?$') as sem_nome,
  b.cliente_desde, b.email, b.tags, b.bot_instructions,
  (select n.notes from bot_customer_notes n
    where n.customer_id = b.customer_id and n.status = 'ativa'
    order by n.updated_at desc nulls last limit 1) as nota_do_bot
from base b;

grant select on public.v_customers_stats to authenticated;
revoke all on public.v_customers_stats from anon;

-- Os números do topo de Passageiros e a quantidade de cada grupo.
create or replace function public.fn_resumo_dos_passageiros()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'viajaram_30d', count(*) filter (
      where ultima_viagem >= (now() at time zone 'America/Fortaleza')::date - 30),
    'novos_no_mes', count(*) filter (where novo),
    'a_receber', coalesce(sum(a_receber), 0),
    'a_receber_pessoas', count(*) filter (where a_receber > 0),
    'grupos', jsonb_build_object(
      'sumiram', count(*) filter (where sumiu),
      'sem_pagamento', count(*) filter (where a_receber > 0),
      'frequentes', count(*) filter (where frequente),
      'marcada', count(*) filter (where proxima_data is not null),
      'novos', count(*) filter (where novo),
      'sem_nome', count(*) filter (where sem_nome)
    )
  )
  from v_customers_stats;
$$;
revoke all on function public.fn_resumo_dos_passageiros() from public, anon;
grant execute on function public.fn_resumo_dos_passageiros() to authenticated;

-- A aba Conversa da ficha: as últimas mensagens (cliente, equipe e bot) e os avisos do app.
create or replace function public.rpc_conversa_do_passageiro(p_customer_id uuid, p_limite int default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_conversa record;
  v_msgs jsonb;
  v_avisos jsonb;
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'SEM_PERMISSAO');
  end if;
  select phone into v_tel from customers where id = p_customer_id and deleted_at is null;
  if v_tel is null then
    return jsonb_build_object('success', true, 'mensagens', '[]'::jsonb, 'avisos', '[]'::jsonb);
  end if;

  select w.id, w.chatwoot_conversation_id into v_conversa
  from whatsapp_conversations w
  where w.deleted_at is null
    and fn_normalizar_telefone(w.phone) = any (fn_variantes_telefone(v_tel))
  order by w.last_message_at desc nulls last
  limit 1;

  select coalesce(jsonb_agg(m order by m.em), '[]'::jsonb) into v_msgs
  from (
    select o.author as autor, left(o.content, 600) as texto, o.created_at as em
    from bot_observations o
    where v_conversa.id is not null
      and o.conversation_id = v_conversa.id
      and o.author in ('cliente', 'equipe', 'bot')
      and coalesce(btrim(o.content), '') <> ''
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limite, 12), 40))
  ) m;

  select coalesce(jsonb_agg(a order by a.em desc), '[]'::jsonb) into v_avisos
  from (
    select av.tipo, av.status, av.trip_date as dia, av.direction as sentido, av.criado_em as em,
           r.extra_data -> 'presenca' ->> 'resposta' as resposta
    from avisos_passageiros av
    left join reservations r on r.id = av.reservation_id
    where av.customer_id = p_customer_id
    order by av.criado_em desc
    limit 6
  ) a;

  return jsonb_build_object(
    'success', true,
    'chatwoot_conversation_id', v_conversa.chatwoot_conversation_id,
    'mensagens', v_msgs,
    'avisos', v_avisos
  );
end;
$$;
revoke all on function public.rpc_conversa_do_passageiro(uuid, int) from public, anon;
grant execute on function public.rpc_conversa_do_passageiro(uuid, int) to authenticated;

-- Trava: as colunas antigas continuam na mesma ordem (o app de hoje lê por nome, mas a view
-- antiga não pode mudar de forma) e anon não lê nada novo.
do $$
begin
  if (select array_agg(attname order by attnum) from pg_attribute
      where attrelid = 'public.v_customers_stats'::regclass and attnum > 0 and not attisdropped)
     [1:15] <> array['customer_id','nome','telefone','notes','bairro_padrao','viagens_count',
       'total_passagens','cancelamentos','nao_compareceu','total_gasto','ultima_data',
       'reservas_total','ponto_padrao','pagamento_padrao','telefone2']::name[] then
    raise exception 'v_customers_stats mudou as colunas antigas';
  end if;
  if has_function_privilege('anon', 'public.rpc_conversa_do_passageiro(uuid, int)', 'execute')
     or has_function_privilege('anon', 'public.fn_resumo_dos_passageiros()', 'execute') then
    raise exception 'anon não pode chamar as funções do CRM';
  end if;
end $$;
