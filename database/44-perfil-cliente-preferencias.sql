-- database/44-perfil-cliente-preferencias.sql
--
-- Perfil do cliente totalmente editável em Passageiros (pedido do dono,
-- 2026-09-20): além do nome/telefone (já dava pra editar via
-- reservationsService.updateCustomerContact, só nunca tinha UI) e da nota
-- livre (já existia), agora dá pra fixar um ponto de embarque e uma forma
-- de pagamento padrão do cliente — usado depois pela Central de
-- Atendimento (WhatsApp → reserva) como sugestão prioritária sobre o
-- cálculo automático do histórico.

alter table public.customers
  add column if not exists default_route_point_code text,
  add column if not exists default_payment_method payment_method;

-- v_customers_stats precisa expor as duas colunas novas pra tela de
-- Passageiros conseguir ler e editar.
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
  count(r.id)                                                     as reservas_total,
  -- novas ao final: CREATE OR REPLACE VIEW só aceita colunas extras no
  -- fim da lista, não permite inserir no meio.
  c.default_route_point_code                                      as ponto_padrao,
  c.default_payment_method                                        as pagamento_padrao
from customers c
left join reservations r on r.customer_id = c.id and r.deleted_at is null and r.type = 'passagem'
left join trips t on t.id = r.trip_id
where c.deleted_at is null
group by c.id, c.name, c.phone, c.notes, c.default_neighborhood,
         c.default_route_point_code, c.default_payment_method;

grant select on public.v_customers_stats to authenticated, service_role;
