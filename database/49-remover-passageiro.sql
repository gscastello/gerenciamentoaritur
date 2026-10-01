-- =====================================================================
-- ROTA PIRAPEMAS — 49: REMOVER CADASTRO DE PASSAGEIRO
-- =====================================================================
-- customers.deleted_at já existe (01-schema.sql) mas não havia RPC de
-- soft-delete (ao contrário de driver/veículo/manutenção). DELETE direto
-- não é opção: reservations.customer_id é NOT NULL sem cascade. Mesmo
-- papel de escrita de customers_write/customers_update (02-rls-policies).
--
-- Rodar depois de 01-48. Idempotente (create or replace).
-- =====================================================================

create or replace function public.rpc_soft_delete_customer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not fn_has_role(array['admin','atendente']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update customers set deleted_at = now(), updated_by = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Passageiro não encontrado.');
  end if;
  return jsonb_build_object('success', true);
end $$;

revoke execute on function public.rpc_soft_delete_customer(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_customer(uuid) to authenticated, service_role;
