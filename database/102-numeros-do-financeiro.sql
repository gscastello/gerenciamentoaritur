-- 102-numeros-do-financeiro.sql — issue #367 (e base do fechamento do mês, #365)
--
-- Uma conta só para "como foi o período": o Assistente responde com ela e o
-- fechamento do mês monta o pacote do contador com ela. Nada é gravado.
--
-- De onde vem cada número:
--   • receita e despesa: lançamentos do Financeiro (financial_entries) — é o que
--     a empresa registrou como entrada/saída (a receita costuma ser o total do dia);
--   • passageiros, valor por sentido, por viagem e ticket médio: reservas de
--     passagem confirmadas/embarcadas (valor da reserva, não o lançamento);
--   • custo por km: abastecimentos com km (fuel_records); sem km lançado → null;
--   • margem por viagem: valor da viagem − combustível ligado à viagem − parte
--     igual das outras despesas do período (rateio). É estimativa: as despesas
--     não são lançadas por viagem;
--   • a receber: reservas confirmadas sem pagamento pago (v_contas_a_receber).
-- Só admin e financeiro.

create or replace function public.rpc_numeros_do_financeiro(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dias int;
  v_ant_de date;
  v_ant_ate date;
  v_out jsonb;
begin
  if not (select fn_has_role(array['admin', 'financeiro']::user_role[])) then
    raise exception 'Números do financeiro são só para admin/financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate > p_de + 400 then
    raise exception 'Período inválido (até 400 dias).' using errcode = '22023';
  end if;
  v_dias := p_ate - p_de + 1;
  v_ant_ate := p_de - 1;
  v_ant_de := p_de - v_dias;

  with
  lanc as (
    select entry_date, type::text as tipo, coalesce(nullif(category, ''), 'sem_categoria') as categoria, amount
      from financial_entries
     where deleted_at is null and entry_date between p_de and p_ate
  ),
  res as (
    select r.id, r.customer_id, r.trip_id, t.trip_date, t.direction::text as sentido,
           r.quantity, coalesce(r.total_price, 0) as valor, r.payment_method::text as forma
      from reservations r
      join trips t on t.id = r.trip_id and t.deleted_at is null
     where r.deleted_at is null and r.type = 'passagem'
       and r.status in ('confirmada', 'embarcado')
       and t.trip_date between p_de and p_ate
  ),
  comb as (
    select f.trip_id, f.vehicle_id, f.km, f.liters, f.cost
      from fuel_records f
     where f.deleted_at is null and f.record_date between p_de and p_ate
  ),
  tot as (
    select coalesce(sum(amount) filter (where tipo = 'receita'), 0) as receita,
           coalesce(sum(amount) filter (where tipo = 'despesa'), 0) as despesa
      from lanc
  ),
  viagens as (
    select r.trip_id, min(r.trip_date) as data, min(r.sentido) as sentido,
           sum(r.quantity) as passageiros, sum(r.valor) as valor,
           coalesce((select sum(c.cost) from comb c where c.trip_id = r.trip_id), 0) as combustivel
      from res r group by r.trip_id
  ),
  -- as despesas são rateadas por todas as viagens que rodaram no período (não
  -- só as que têm reserva no app), senão o custo de cada uma fica inflado
  rodadas as (
    select count(*) as n from trips
     where deleted_at is null and status <> 'cancelada' and trip_date between p_de and least(p_ate, current_date)
  ),
  rateio as (
    select case when greatest((select n from rodadas), (select count(*) from viagens)) > 0
                then ((select despesa from tot) - coalesce((select sum(combustivel) from viagens), 0))
                     / greatest((select n from rodadas), (select count(*) from viagens))
                else 0 end as por_viagem
  ),
  ant as (
    select
      (select coalesce(sum(amount) filter (where type = 'receita'), 0) from financial_entries
        where deleted_at is null and entry_date between v_ant_de and v_ant_ate) as receita,
      (select coalesce(sum(amount) filter (where type = 'despesa'), 0) from financial_entries
        where deleted_at is null and entry_date between v_ant_de and v_ant_ate) as despesa,
      (select coalesce(sum(r.quantity), 0) from reservations r join trips t on t.id = r.trip_id and t.deleted_at is null
        where r.deleted_at is null and r.type = 'passagem' and r.status in ('confirmada', 'embarcado')
          and t.trip_date between v_ant_de and v_ant_ate) as passageiros
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate, 'dias', v_dias),
    'lancamentos', jsonb_build_object(
      'receita', round((select receita from tot), 2),
      'despesa', round((select despesa from tot), 2),
      'resultado', round((select receita - despesa from tot), 2),
      'margem_pct', case when (select receita from tot) > 0
                         then round((select (receita - despesa) / receita * 100 from tot), 1) end,
      'despesa_por_categoria', coalesce((
        select jsonb_object_agg(categoria, total order by total desc)
          from (select categoria, round(sum(amount), 2) as total from lanc where tipo = 'despesa' group by 1) x), '{}'),
      'receita_por_categoria', coalesce((
        select jsonb_object_agg(categoria, total order by total desc)
          from (select categoria, round(sum(amount), 2) as total from lanc where tipo = 'receita' group by 1) x), '{}'),
      'por_mes', coalesce((
        select jsonb_agg(jsonb_build_object('mes', mes, 'receita', receita, 'despesa', despesa,
                                            'resultado', receita - despesa) order by mes)
          from (select to_char(entry_date, 'YYYY-MM') as mes,
                       round(coalesce(sum(amount) filter (where tipo = 'receita'), 0), 2) as receita,
                       round(coalesce(sum(amount) filter (where tipo = 'despesa'), 0), 2) as despesa
                  from lanc group by 1) x), '[]')
    ),
    'reservas', jsonb_build_object(
      'passageiros', coalesce((select sum(quantity) from res), 0),
      'valor', round(coalesce((select sum(valor) from res), 0), 2),
      'viagens', (select count(*) from viagens),
      'ticket_medio', (select round(sum(valor) / nullif(sum(quantity), 0), 2) from res where valor > 0),
      -- quanto da receita lançada aparece nas reservas do app: abaixo de 100%, parte
      -- das passagens não foi lançada no app (números por viagem ficam por baixo)
      'cobertura_da_receita_pct', case when (select receita from tot) > 0
                                       then round(coalesce((select sum(valor) from res), 0) / (select receita from tot) * 100, 1) end,
      'por_sentido', coalesce((
        select jsonb_object_agg(sentido, jsonb_build_object(
                 'passageiros', passageiros, 'valor', valor, 'viagens', viagens,
                 'ticket_medio', round(valor / nullif(passageiros, 0), 2),
                 'media_por_viagem', round(passageiros::numeric / nullif(viagens, 0), 1)))
          from (select sentido, sum(quantity) as passageiros, round(sum(valor), 2) as valor,
                       count(distinct trip_id) as viagens
                  from res group by 1) x), '{}'),
      'por_mes', coalesce((
        select jsonb_agg(jsonb_build_object('mes', mes, 'passageiros', passageiros, 'valor', valor) order by mes)
          from (select to_char(trip_date, 'YYYY-MM') as mes, sum(quantity) as passageiros, round(sum(valor), 2) as valor
                  from res group by 1) x), '[]'),
      'por_forma_de_pagamento', coalesce((
        select jsonb_object_agg(forma, valor)
          from (select coalesce(forma, 'nao_informado') as forma, round(sum(valor), 2) as valor from res group by 1) x), '{}')
    ),
    'viagens', jsonb_build_object(
      'rodadas', (select n from rodadas),
      'com_reserva_no_app', (select count(*) from viagens),
      'custo_rateado_por_viagem', round((select por_viagem from rateio), 2),
      'nota', 'Margem = valor da viagem − combustível da viagem − parte igual das outras despesas do período (estimativa).',
      'lista', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'data', data, 'sentido', sentido, 'passageiros', passageiros, 'valor', round(valor, 2),
                 'combustivel', round(combustivel, 2),
                 'margem', round(valor - combustivel - (select por_viagem from rateio), 2)) order by data, sentido)
          from (select * from viagens order by data desc, sentido limit 120) v), '[]')
    ),
    'frota', jsonb_build_object(
      'km', coalesce((select sum(km) from comb), 0),
      'litros', coalesce((select sum(liters) from comb), 0),
      'combustivel', round(coalesce((select sum(cost) from comb), 0), 2),
      'custo_combustivel_por_km', (select round(sum(cost) / nullif(sum(km), 0), 2) from comb where km > 0),
      'custo_total_por_km', (select round((select despesa from tot) / nullif(sum(km), 0), 2) from comb),
      'km_por_litro', (select round(sum(km) / nullif(sum(liters), 0), 2) from comb where km > 0 and liters > 0),
      'nota', case when coalesce((select sum(km) from comb), 0) = 0
                   then 'Sem km lançado nos abastecimentos do período: custo por km indisponível.' end
    ),
    'quem_mais_viaja', coalesce((
      select jsonb_agg(jsonb_build_object('nome', coalesce(nullif(c.name, ''), 'sem nome'), 'passagens', x.passagens,
                                          'viagens', x.viagens, 'valor', x.valor) order by x.passagens desc, x.valor desc)
        from (select customer_id, sum(quantity) as passagens, count(distinct trip_id) as viagens, round(sum(valor), 2) as valor
                from res group by 1 order by 2 desc, 4 desc limit 10) x
        join customers c on c.id = x.customer_id), '[]'),
    'a_receber', (
      select jsonb_build_object(
               'reservas', count(*),
               'total', round(coalesce(sum(valor_devido), 0), 2),
               'vencido', round(coalesce(sum(valor_devido) filter (where vencimento < current_date), 0), 2),
               'nota', 'Reservas confirmadas sem pagamento marcado como pago (inclui as pagas em dinheiro sem baixa).')
        from v_contas_a_receber where vencimento between p_de and p_ate),
    'periodo_anterior', (
      select jsonb_build_object('de', v_ant_de, 'ate', v_ant_ate,
               'receita', round(receita, 2), 'despesa', round(despesa, 2),
               'resultado', round(receita - despesa, 2), 'passageiros', passageiros)
        from ant)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.rpc_numeros_do_financeiro(date, date) from public, anon;
grant execute on function public.rpc_numeros_do_financeiro(date, date) to authenticated, service_role;
