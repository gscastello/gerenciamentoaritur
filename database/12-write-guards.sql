-- =====================================================================
-- ROTA PIRAPEMAS — 12: Guardas de escrita (impede adulteração de campos)
-- =====================================================================
-- Rodar depois de 01–11. Idempotente.
--
-- Até aqui o RLS de UPDATE só checava o PAPEL, não QUAIS colunas — um
-- admin/atendente (ou uma sessão comprometida) podia mandar um PATCH
-- direto em /rest/v1/reservations mexendo em status, total_price, trip_id,
-- quantity... furando o fluxo de RPC + trigger de capacidade.
--
-- Correção: GRANT de UPDATE por COLUNA. O `authenticated` só altera por
-- PATCH direto as colunas "de detalhe"; tudo que afeta dinheiro, vaga ou
-- vínculo continua só via função RPC (SECURITY DEFINER).
--
-- Também: o frontend NUNCA faz DELETE — só RPCs de soft-delete. Então
-- tiramos DELETE de authenticated/anon em todo o schema.

-- ---- DELETE: ninguém apaga linha direto ----------------------------
revoke delete on all tables in schema public from authenticated, anon;

-- ---- reservations: PATCH direto só nos campos de detalhe -----------
revoke update on public.reservations from authenticated, anon;
grant  update (
  dropoff_location, payment_method, street, reference_point,
  pickup_neighborhood, pickup_detail, updated_by
) on public.reservations to authenticated;

-- ---- customers: nome/telefone/notas/bairro ------------------------
revoke update on public.customers from authenticated, anon;
grant  update (name, phone, notes, default_neighborhood, updated_by)
  on public.customers to authenticated;

-- ---- payments: só o estado do pagamento, nunca o valor ------------
revoke update on public.payments from authenticated, anon;
grant  update (status, paid_at, proof_received, proof_url, updated_by)
  on public.payments to authenticated;

-- ---- settings: só o valor (RLS já é admin-only) -------------------
revoke update on public.settings from authenticated, anon;
grant  update (key, value, updated_by) on public.settings to authenticated;

-- Conferência:
--   select table_name, string_agg(column_name, ', ') as cols
--   from information_schema.role_column_grants
--   where grantee='authenticated' and privilege_type='UPDATE' and table_schema='public'
--   group by table_name;
