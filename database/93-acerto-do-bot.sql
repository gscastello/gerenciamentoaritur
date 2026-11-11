-- =====================================================================
-- ROTA PIRAPEMAS — 93: ACERTO DO BOT (#311)
-- =====================================================================
-- Rodar depois de 01–92. Idempotente.
-- Pedido do dono (11/11): saber quantas reservas o bot lançou e quantas a equipe
-- precisou corrigir, para decidir quando ligar o modo `ia` com segurança.
-- Não cria tabela nova: o audit_logs já guarda o antes/depois de cada mudança de
-- reserva (também do histórico). Para cada reserva lançada pelo bot (criada pelo
-- usuário "Bot WhatsApp" ou pelo "Agendado ☑️"), olha o que OUTRA pessoa mudou:
--   - correcao     → mudou o que o bot tinha gravado (dia/sentido, embarque, bairro,
--                    endereço, rua, desembarque, quantidade, valor);
--   - complemento  → preencheu o que estava vazio ou "a confirmar" (endereço, valor 0);
--   - cancelamento → status virou cancelada (pode ser pedido do cliente: não conta como erro).
-- Acerto = reservas lançadas sem nenhuma correção ÷ lançadas.
-- Mudança que o CLIENTE pediu depois (trocar o dia) também aparece como correção:
-- a lista mostra cada uma para o dono julgar.
-- =====================================================================

create or replace function public.fn_bot_acerto(p_dias integer default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with bot as (
    select id from users where name = 'Bot WhatsApp' limit 1
  ),
  lancadas as (
    select r.id, r.customer_id, r.trip_id, r.created_at
    from reservations r
    where r.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
      and r.deleted_at is null
      and (r.created_by = (select id from bot) or r.extra_data->>'origem' = 'agendado_equipe')
  ),
  mudancas as (
    select l.id reserva, l.customer_id, l.trip_id, a.performed_at em, a.performed_by por, c.coluna, c.campo,
           a.before_data -> c.coluna antes, a.after_data -> c.coluna depois
    from lancadas l
    join audit_logs a on a.entity_table = 'reservations' and a.entity_id = l.id and a.action in ('update', 'status_change')
    cross join lateral (values
      ('trip_id', 'dia/sentido'), ('route_point_id', 'embarque'), ('pickup_neighborhood', 'bairro'),
      ('pickup_detail', 'endereço'), ('street', 'rua'), ('dropoff_location', 'desembarque'),
      ('quantity', 'quantidade'), ('unit_price', 'valor'), ('status', 'status')
    ) c(coluna, campo)
    where a.performed_by is not null
      and a.performed_by is distinct from (select id from bot)
      and (a.before_data -> c.coluna) is distinct from (a.after_data -> c.coluna)
  ),
  classificadas as (
    select m.*,
           case
             when m.coluna = 'status' then case when m.depois #>> '{}' = 'cancelada' then 'cancelamento' end
             when m.coluna = 'unit_price' and coalesce(nullif(m.antes #>> '{}', '')::numeric, 0) = 0 then 'complemento'
             when coalesce(btrim(m.antes #>> '{}'), '') = '' or (m.antes #>> '{}') ilike '%confirmar%' then 'complemento'
             else 'correcao'
           end tipo
    from mudancas m
  ),
  validas as (
    select * from classificadas where tipo is not null
  ),
  legiveis as (
    select v.*,
           case v.coluna
             when 'trip_id' then (select to_char(t.trip_date, 'DD/MM') || ' ' || initcap(t.direction::text) from trips t where t.id::text = v.antes #>> '{}')
             when 'route_point_id' then (select rp.name from route_points rp where rp.id::text = v.antes #>> '{}')
             else v.antes #>> '{}'
           end antes_txt,
           case v.coluna
             when 'trip_id' then (select to_char(t.trip_date, 'DD/MM') || ' ' || initcap(t.direction::text) from trips t where t.id::text = v.depois #>> '{}')
             when 'route_point_id' then (select rp.name from route_points rp where rp.id::text = v.depois #>> '{}')
             else v.depois #>> '{}'
           end depois_txt
    from validas v
  ),
  totais as (
    select (select count(*) from lancadas) lancadas,
           (select count(distinct reserva) from validas where tipo = 'correcao') corrigidas,
           (select count(distinct reserva) from validas where tipo = 'complemento') completadas,
           (select count(distinct reserva) from validas where tipo = 'cancelamento') canceladas
  )
  select jsonb_build_object(
    'success', true,
    'dias', greatest(1, least(coalesce(p_dias, 30), 365)),
    'lancadas', t.lancadas,
    'corrigidas', t.corrigidas,
    'completadas', t.completadas,
    'canceladas', t.canceladas,
    'acerto', case when t.lancadas > 0 then round(100.0 * (t.lancadas - t.corrigidas) / t.lancadas) end,
    'correcoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'reserva', x.reserva,
               'cliente', x.cliente,
               'viagem', x.viagem,
               'campo', x.campo,
               'antes', x.antes_txt,
               'depois', x.depois_txt,
               'tipo', x.tipo,
               'por', x.por_nome,
               'em', x.em
             ) order by x.em desc)
      from (
        select l.*, c.name cliente, u.name por_nome,
               (select to_char(tr.trip_date, 'DD/MM') || ' ' || initcap(tr.direction::text)
                  from reservations r join trips tr on tr.id = r.trip_id where r.id = l.reserva) viagem
        from legiveis l
        left join customers c on c.id = l.customer_id
        left join users u on u.id = l.por
        where l.tipo = 'correcao'
        order by l.em desc
        limit 50
      ) x
    ), '[]'::jsonb)
  )
  from totais t
$$;
revoke all on function public.fn_bot_acerto(integer) from public, anon, authenticated;

-- Para o app (aba Sistema → Bot): só quem administra ou atende.
create or replace function public.rpc_bot_acerto(p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_has_role(array['admin', 'atendente']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  return fn_bot_acerto(p_dias);
end
$$;
revoke all on function public.rpc_bot_acerto(integer) from public, anon;
grant execute on function public.rpc_bot_acerto(integer) to authenticated;

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------
do $$
declare v jsonb;
begin
  v := fn_bot_acerto(30);
  if not (v ? 'lancadas' and v ? 'corrigidas' and v ? 'correcoes') then
    raise exception 'fn_bot_acerto sem os totais';
  end if;
  if (v->>'corrigidas')::int > (v->>'lancadas')::int then
    raise exception 'mais corrigidas que lançadas';
  end if;
end $$;
