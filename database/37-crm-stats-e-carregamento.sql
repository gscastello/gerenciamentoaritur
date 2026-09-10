-- =====================================================================
-- ROTA PIRAPEMAS — 37: CRM agregado no banco (carregamento sob demanda)
-- =====================================================================
-- A aba Passageiros somava tudo no cliente a partir da janela de 240
-- dias de reservas. Não escala. `v_customers_stats` faz o agregado no
-- banco (uma linha por cliente) e a tela pagina + busca no servidor;
-- o histórico detalhado de cada cliente carrega só quando o card abre.
--
-- Rodar depois de 01-36. Idempotente. security_invoker → respeita o RLS
-- de customers / reservations do usuário logado.
-- =====================================================================

create or replace view public.v_customers_stats
with (security_invoker = true) as
select
  c.id                                                            as customer_id,
  c.name                                                          as nome,
  c.phone                                                         as telefone,
  c.notes,
  c.default_neighborhood                                          as bairro_padrao,
  count(r.id) filter (where r.status in ('confirmada', 'embarcado'))            as viagens_count,
  coalesce(sum(r.quantity) filter (where r.status in ('confirmada', 'embarcado')), 0)::int as total_passagens,
  count(r.id) filter (where r.status = 'cancelada')               as cancelamentos,
  count(r.id) filter (where r.status = 'nao_compareceu')          as nao_compareceu,
  coalesce(sum(r.total_price) filter (where r.status in ('confirmada', 'embarcado')), 0) as total_gasto,
  max(t.trip_date)                                                as ultima_data,
  count(r.id)                                                     as reservas_total
from customers c
left join reservations r on r.customer_id = c.id and r.deleted_at is null and r.type = 'passagem'
left join trips t on t.id = r.trip_id
where c.deleted_at is null
group by c.id, c.name, c.phone, c.notes, c.default_neighborhood;

grant select on public.v_customers_stats to authenticated, service_role;

-- Busca por nome/telefone rápida (trigram) — o índice de name já existe
-- (idx_customers_name_trgm); adiciona o de phone.
create index if not exists idx_customers_phone_trgm
  on public.customers using gin (phone gin_trgm_ops);

-- Conferir:
--   select nome, telefone, viagens_count, total_gasto, ultima_data
--   from v_customers_stats order by total_gasto desc limit 20;
