-- =====================================================================
-- ROTA PIRAPEMAS — 55: quarto responsável pela busca em casa — Ari (#196)
-- =====================================================================
-- Rodar depois de 01–54. Idempotente.
-- Quem busca o passageiro "em casa": 'taxi' (padrão), 'proprio' (Gustavo),
-- 'motorista' (Maurício) e agora 'ari' (Ari). Ver database/29.
-- =====================================================================

alter table public.reservations drop constraint if exists reservations_pickup_transport_check;
alter table public.reservations add constraint reservations_pickup_transport_check
  check (pickup_transport in ('taxi', 'proprio', 'motorista', 'ari'));

create or replace function public.rpc_set_pickup_transport(p_reservation_id uuid, p_mode text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente','motorista']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_mode is null or p_mode not in ('taxi', 'proprio', 'motorista', 'ari') then
    return jsonb_build_object('success', false, 'message', 'Modo inválido.');
  end if;
  v_actor := auth.uid();

  update reservations set pickup_transport = p_mode, updated_by = v_actor
    where id = p_reservation_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;

  return jsonb_build_object('success', true, 'mode', p_mode);
end;
$fn$;
revoke execute on function public.rpc_set_pickup_transport(uuid, text) from public, anon;
grant  execute on function public.rpc_set_pickup_transport(uuid, text) to authenticated, service_role;

-- Conferir:
--   select public.rpc_set_pickup_transport('<uuid>', 'ari');
