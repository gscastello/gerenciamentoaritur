-- database/46-veiculos-e-tipos-manutencao.sql
--
-- Frota: adicionar/remover veículo (hoje só dava pra editar os existentes
-- ou marcar o padrão) e catálogo de tipos de manutenção (hoje era texto
-- livre, risco de "troca de óleo" virar duas categorias por causa de
-- maiúscula). Pedido do dono, 2026-09-20 — parte do audit de melhorias.

-- soft-delete de veículo, mesmo padrão de rpc_soft_delete_driver/maintenance
-- (vehicles não tem RPC de delete ainda — trips/fuel_records/maintenance
-- referenciam vehicle_id sem cascade, nunca dá pra fazer DELETE de
-- verdade). Bloqueia remover o veículo marcado como padrão.
create or replace function public.rpc_soft_delete_vehicle(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor      uuid;
  v_is_default boolean;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := auth.uid();

  select is_default into v_is_default from vehicles where id = p_id and deleted_at is null;
  if v_is_default is null then
    return jsonb_build_object('success', false, 'message', 'Veículo não encontrado.');
  end if;
  if v_is_default then
    return jsonb_build_object('success', false, 'message', 'Defina outro veículo como padrão antes de remover este.');
  end if;

  update vehicles set deleted_at = now(), active = false, updated_by = v_actor where id = p_id;
  return jsonb_build_object('success', true);
end $$;

revoke execute on function public.rpc_soft_delete_vehicle(uuid) from public, anon;
grant execute on function public.rpc_soft_delete_vehicle(uuid) to authenticated, service_role;

-- Catálogo simples de tipos de manutenção — NÃO é expense_categories
-- (aquilo é categoria financeira do Gestão); isto é só "que serviço foi
-- feito" no veículo. Sem "grupo"/"kind", é um conceito bem mais simples.
create table if not exists public.maintenance_types (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  active      boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id)
);

alter table public.maintenance_types enable row level security;

create policy maintenance_types_select on public.maintenance_types
  for select using (true);
create policy maintenance_types_write on public.maintenance_types
  for insert with check (fn_has_role(array['admin', 'financeiro']::user_role[]));
create policy maintenance_types_update on public.maintenance_types
  for update
  using (fn_has_role(array['admin', 'financeiro']::user_role[]))
  with check (fn_has_role(array['admin', 'financeiro']::user_role[]));

grant select, insert, update on public.maintenance_types to authenticated;

insert into public.maintenance_types (label, sort_order)
select label, sort_order from (values
  ('Troca de óleo', 10), ('Revisão geral', 20), ('Troca de pneus', 30),
  ('Freios', 40), ('Suspensão', 50), ('Elétrica', 60), ('Outro', 100)
) as seed(label, sort_order)
where not exists (select 1 from public.maintenance_types);
