-- =====================================================================
-- ROTA PIRAPEMAS — 23: PREÇO POR BAIRRO EDITÁVEL PELO APP (Sistema)
-- =====================================================================
-- A tabela `neighborhood_pricing` (01-schema.sql) já existe e está
-- populada (~131 bairros, "Buscar em Casa" R$80/R$90). O bot já lê dela
-- (whatsappService.getNeighborhoodPrice). O que faltava:
--   1) o FRONTEND ainda usava uma lista fixa no código (App.jsx) —
--      corrigido no PR (useNeighborhoodPricing);
--   2) não havia como REMOVER um bairro pelo app (só insert/update).
--
-- Esta migração: policy de DELETE (admin), RPC de upsert case-insensitive
-- e realtime. `neighborhood` é citext, então "cohama" e "Cohama" são o
-- mesmo bairro.
--
-- Rodar depois de 01-22. Idempotente.
-- =====================================================================

drop policy if exists neighborhood_pricing_admin_delete on public.neighborhood_pricing;
create policy neighborhood_pricing_admin_delete on public.neighborhood_pricing for delete
  to authenticated
  using (fn_has_role(array['admin']::user_role[]));

-- upsert por nome (citext casa maiúsc/minúsc); mantém o histórico de quem mexeu
create or replace function public.rpc_upsert_neighborhood_price(p_neighborhood text, p_price numeric)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if coalesce(btrim(p_neighborhood), '') = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o nome do bairro.');
  end if;
  if p_price is null or p_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero.');
  end if;

  insert into neighborhood_pricing (neighborhood, price, created_by, updated_by)
  values (btrim(p_neighborhood), p_price, auth.uid(), auth.uid())
  on conflict (neighborhood) do update
    set price = excluded.price, updated_by = auth.uid()
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id);
end;
$fn$;
revoke execute on function public.rpc_upsert_neighborhood_price(text, numeric) from public, anon;
grant  execute on function public.rpc_upsert_neighborhood_price(text, numeric) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.neighborhood_pricing;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select neighborhood, price from neighborhood_pricing order by price, neighborhood;
--   select public.rpc_upsert_neighborhood_price('Bairro Teste', 85);
