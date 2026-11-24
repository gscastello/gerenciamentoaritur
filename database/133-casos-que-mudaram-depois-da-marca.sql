-- 133-casos-que-mudaram-depois-da-marca.sql — issue #508
--
-- O caso do bot (`bot_casos`) guarda em `esperado` as reservas como estavam quando o caso foi
-- gerado (madrugada seguinte), não na hora do "Agendado ☑️". Se o cliente mudou algo depois da
-- marca ("É no retorno viu", caso 8bfa7860), o caso passa a esperar a mudança e a avaliação acusa
-- "errado" à toa. O estado da hora da marca não serve sozinho (foi o próprio bot que gravou: ele se
-- avaliaria), e só uma pessoa sabe se o cliente mudou de ideia ou corrigiu um erro de leitura.
--
-- Então o caso ganha a marca `mudou_depois` (jsonb, null = não mudou): a reserva teve dia/sentido
-- (trip_id), ponto, quantidade ou bairro trocado em `audit_logs` DEPOIS da primeira mensagem do
-- cliente posterior à marca (mais de 30 s depois). Guarda o que mudou, as mensagens do cliente e o
-- `esperado_da_marca` (o estado antes da primeira mudança). Caso marcado e não `verificado` vira
-- "pendente: mudou depois da marca: conferir" na avaliação (avaliacaoPura.ts), nunca errado nem
-- certo calado. O dono confere na aba Sistema → Bot (`rpc_conferir_caso_bot`): vale o da marca
-- (o cliente mudou depois) ou vale o de agora (a reserva lançada estava errada).

alter table public.bot_casos add column if not exists mudou_depois jsonb;
comment on column public.bot_casos.mudou_depois is
  'Issue #508: a reserva mudou depois de uma nova mensagem do cliente posterior à marca. null = não mudou. {mensagem_em, mensagens, mudancas[], esperado_da_marca[], conferido?}';

-- Mudanças de um caso depois da marca (null = nenhuma). Só lê.
create or replace function public.fn_mudancas_depois_da_marca(p_caso uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c bot_casos%rowtype;
  v_prox timestamptz;
  v_mudancas jsonb;
  v_marca jsonb;
  v_ate timestamptz;
  v_msgs jsonb;
begin
  select * into c from bot_casos where id = p_caso;
  if not found then return null; end if;
  select min(o.created_at) into v_prox
    from bot_observations o
   where o.conversation_id = c.conversation_id and o.author = 'cliente'
     and o.created_at > c.marca_em + interval '30 seconds';
  if v_prox is null then return null; end if;

  with itens as (
    select e, (e->>'reservation_id')::uuid rid, ord
      from jsonb_array_elements(c.esperado) with ordinality as x(e, ord)
     where e->>'reservation_id' is not null
  ),
  primeira as (
    select distinct on (i.rid) i.rid, i.ord, i.e, l.performed_at, l.before_data b, l.after_data a
      from itens i
      join audit_logs l on l.entity_table = 'reservations' and l.action = 'update' and l.entity_id = i.rid
     where l.performed_at > v_prox
       and (l.before_data->'trip_id' is distinct from l.after_data->'trip_id'
         or l.before_data->'route_point_id' is distinct from l.after_data->'route_point_id'
         or l.before_data->'quantity' is distinct from l.after_data->'quantity'
         or l.before_data->'pickup_neighborhood' is distinct from l.after_data->'pickup_neighborhood')
     order by i.rid, l.performed_at
  ),
  antes as (
    select p.*, jsonb_build_object(
             'trip_date', t.trip_date, 'direction', t.direction, 'route_point_code', rp.code,
             'quantity', (p.b->>'quantity')::int, 'pickup_neighborhood', p.b->>'pickup_neighborhood',
             'type', coalesce(p.b->>'type', p.e->>'type'), 'reservation_id', p.rid) de
      from primeira p
      left join trips t on t.id = (p.b->>'trip_id')::uuid
      left join route_points rp on rp.id = (p.b->>'route_point_id')::uuid
  )
  select jsonb_agg(jsonb_build_object(
           'reservation_id', a.rid, 'em', a.performed_at, 'de', a.de, 'para', a.e,
           'campos', to_jsonb(array_remove(array[
             case when a.b->'trip_id' is distinct from a.a->'trip_id' then 'dia/sentido' end,
             case when a.b->'route_point_id' is distinct from a.a->'route_point_id' then 'ponto' end,
             case when a.b->'quantity' is distinct from a.a->'quantity' then 'quantidade' end,
             case when a.b->'pickup_neighborhood' is distinct from a.a->'pickup_neighborhood' then 'bairro' end
           ], null))) order by a.ord),
         max(a.performed_at)
    into v_mudancas, v_ate
    from antes a;
  if v_mudancas is null then return null; end if;

  -- esperado da hora da marca: o item de antes da primeira mudança; o que não mudou fica igual
  select jsonb_agg(coalesce(
           (select m->'de' from jsonb_array_elements(v_mudancas) m where m->>'reservation_id' = x.e->>'reservation_id'),
           x.e) order by x.ord)
    into v_marca
    from jsonb_array_elements(c.esperado) with ordinality as x(e, ord);

  select jsonb_agg(jsonb_build_object('em', o.created_at, 'texto', left(o.content, 300)) order by o.created_at)
    into v_msgs
    from (select * from bot_observations o
           where o.conversation_id = c.conversation_id and o.author = 'cliente'
             and o.created_at >= v_prox and o.created_at <= v_ate
           order by o.created_at limit 8) o;

  return jsonb_build_object('mensagem_em', v_prox, 'mensagens', coalesce(v_msgs, '[]'::jsonb),
                            'mudancas', v_mudancas, 'esperado_da_marca', v_marca);
end;
$function$;
revoke all on function public.fn_mudancas_depois_da_marca(uuid) from public, anon, authenticated;

-- Marca os casos ainda sem marca. Não mexe em `esperado` nem em `verificado`. Devolve quantos marcou.
create or replace function public.fn_marcar_casos_mudados()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  with m as (
    select id, fn_mudancas_depois_da_marca(id) j from bot_casos where mudou_depois is null
  )
  update bot_casos c set mudou_depois = m.j from m where m.id = c.id and m.j is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.fn_marcar_casos_mudados() from public, anon, authenticated;
grant execute on function public.fn_marcar_casos_mudados() to service_role;

-- fn_gerar_casos_bot: igual à de database/111, e no fim marca os casos que mudaram depois da marca.
create or replace function public.fn_gerar_casos_bot(p_desde timestamptz default timestamptz '2026-11-10 00:00:00-03')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_novos integer;
begin
  with marcas as (
    select o.chatwoot_message_id mid, o.chatwoot_conversation_id cw, o.conversation_id cid, o.created_at em, w.phone,
           w.telefone_variantes
      from bot_observations o
      join whatsapp_conversations w on w.id = o.conversation_id
     where o.author = 'equipe' and o.created_at >= p_desde
       and o.chatwoot_message_id is not null
       and o.content ~* 'agendad' and o.content ~ '[☑✅✔]'
       and o.content !~ '\?\s*$'
  ),
  alvo as (
    select m.*, (select c.id from customers c
                   where c.deleted_at is null and c.phone = any(m.telefone_variantes)
                   order by c.created_at limit 1) cliente
      from marcas m
  ),
  novos as (
    insert into bot_casos (chatwoot_conversation_id, conversation_id, mensagem_id, marca_em, telefone, esperado)
    select a.cw, a.cid, a.mid, a.em, a.phone,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'trip_date', t.trip_date, 'direction', t.direction, 'route_point_code', rp.code,
                      'quantity', r.quantity, 'pickup_neighborhood', r.pickup_neighborhood, 'type', r.type,
                      'reservation_id', r.id)
                    order by t.trip_date, t.direction)
               from reservations r
               join trips t on t.id = r.trip_id
               left join route_points rp on rp.id = r.route_point_id
              where r.deleted_at is null
                and (r.customer_id = a.cliente or r.whatsapp_source_message_id like 'cw-' || a.mid || '-agendado-%')
                and r.created_at >= a.em - interval '1 minute'
                and r.created_at < a.em + interval '12 hours'
                and not (r.status = 'cancelada' and r.cancelled_at < r.created_at + interval '30 minutes')
           ), '[]'::jsonb)
      from alvo a
    on conflict (mensagem_id) do nothing
    returning 1
  )
  select count(*) into v_novos from novos;
  -- issue #508: o esperado é o de agora; se mudou depois de uma nova mensagem do cliente, o caso
  -- fica marcado para uma pessoa conferir
  perform fn_marcar_casos_mudados();
  return v_novos;
end;
$$;
revoke all on function public.fn_gerar_casos_bot(timestamptz) from public, anon, authenticated;
grant execute on function public.fn_gerar_casos_bot(timestamptz) to service_role;

-- Lista para a aba Sistema → Bot: casos marcados e ainda não conferidos, com a última avaliação.
create or replace function public.rpc_bot_casos_a_conferir()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Só o admin confere os casos do bot.');
  end if;
  return jsonb_build_object('success', true, 'casos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'chatwoot_conversation_id', c.chatwoot_conversation_id, 'marca_em', c.marca_em,
             'telefone', c.telefone, 'esperado', c.esperado, 'mudou_depois', c.mudou_depois,
             'avaliacao', (select jsonb_build_object('rodada', a.rodada, 'resultado', a.resultado,
                                                     'diferencas', a.diferencas, 'em', a.criado_em)
                             from bot_avaliacoes a
                            where a.caso_id = c.id and a.resultado <> 'erro'
                            order by a.criado_em desc limit 1))
           order by c.marca_em desc)
      from bot_casos c
     where c.ativo and not c.verificado and c.mudou_depois is not null
  ), '[]'::jsonb));
end;
$function$;
revoke all on function public.rpc_bot_casos_a_conferir() from public, anon;
grant execute on function public.rpc_bot_casos_a_conferir() to authenticated;

-- O dono confere: 'marca' = o cliente mudou depois (o esperado volta a ser o da hora da marca,
-- como no 8bfa7860); 'agora' = a reserva lançada estava errada (fica o esperado de agora).
create or replace function public.rpc_conferir_caso_bot(p_caso uuid, p_vale text, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c bot_casos%rowtype;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Só o admin confere os casos do bot.');
  end if;
  if p_vale not in ('marca', 'agora') then
    return jsonb_build_object('success', false, 'message', 'Escolha o da marca ou o de agora.');
  end if;
  select * into c from bot_casos where id = p_caso for update;
  if not found or c.mudou_depois is null then
    return jsonb_build_object('success', false, 'message', 'Caso não encontrado ou sem mudança depois da marca.');
  end if;
  if c.verificado then
    return jsonb_build_object('success', false, 'message', 'Este caso já foi conferido.');
  end if;
  update bot_casos
     set verificado = true,
         esperado = case when p_vale = 'marca' then coalesce(c.mudou_depois->'esperado_da_marca', c.esperado) else c.esperado end,
         observacao = concat_ws(E'\n', nullif(c.observacao, ''),
           'Conferido (' || to_char(now() at time zone 'America/Fortaleza', 'DD/MM HH24:MI') || '): ' ||
           case when p_vale = 'marca' then 'o cliente mudou depois da marca; vale o esperado da hora da marca.'
                else 'a reserva da marca estava errada; vale o esperado de agora.' end ||
           coalesce(' ' || nullif(trim(p_observacao), ''), '')),
         -- rastro: quem conferiu, quando e o esperado de antes
         mudou_depois = c.mudou_depois || jsonb_build_object('conferido', jsonb_build_object(
           'por', auth.uid(), 'em', now(), 'vale', p_vale, 'esperado_antes', c.esperado))
   where id = p_caso;
  return jsonb_build_object('success', true);
end;
$function$;
revoke all on function public.rpc_conferir_caso_bot(uuid, text, text) from public, anon;
grant execute on function public.rpc_conferir_caso_bot(uuid, text, text) to authenticated;

-- Migração única: marca os casos que já existem (em 24/11: 47 casos ativos, 24 sem verificado).
select public.fn_marcar_casos_mudados();
