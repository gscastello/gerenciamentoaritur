-- =====================================================================
-- ROTA PIRAPEMAS — 95: INSTRUÇÕES DA EQUIPE POR PASSAGEIRO E COSTUME COM
-- "EMBARQUE VARIA" (#328)
-- =====================================================================
-- Rodar depois de 01–94. Idempotente.
-- Pedido do dono (11/11): dizer ao assistente o hábito de um passageiro ("na Ida o
-- embarque varia entre dois lugares; o desembarque é sempre o mesmo; na Volta o
-- embarque é sempre o mesmo") e isso valer para os próximos agendamentos.
--   1) customers.bot_instructions: instruções da equipe sobre o passageiro. O
--      aprendizado NÃO mexe aqui (a anotação automática fica em bot_customer_notes);
--      o bot e o assistente leem e seguem.
--   2) endereço de costume com o ponto vazio = "embarque varia": o bot não chuta o
--      embarque, mas usa o desembarque de costume.
-- =====================================================================

alter table public.customers add column if not exists bot_instructions text;

alter table public.customer_habitual_addresses alter column route_point_code drop not null;

create or replace function public.rpc_definir_endereco_de_costume(
  p_customer_id uuid,
  p_direction trip_direction,
  p_route_point_code text,
  p_neighborhood text default null,
  p_detail text default null,
  p_dropoff_location text default null,
  p_dropoff_area text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_id uuid; v_ponto text := nullif(btrim(p_route_point_code), '');
begin
  if v_actor is not null and not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and deleted_at is null) then
    return jsonb_build_object('success', false, 'message', 'Cliente não encontrado.');
  end if;
  -- ponto vazio = "embarque varia" (#328): precisa ao menos do desembarque
  if v_ponto is null and nullif(btrim(p_dropoff_location), '') is null then
    return jsonb_build_object('success', false, 'message', 'Diga o ponto de embarque ou, se o embarque varia, o desembarque de costume.');
  end if;
  if v_ponto is not null and not exists (select 1 from route_points where code = v_ponto and direction = p_direction and deleted_at is null) then
    return jsonb_build_object('success', false, 'message', 'Ponto de embarque inexistente nesse sentido.');
  end if;
  update customer_habitual_addresses set route_point_code = v_ponto,
         neighborhood = case when v_ponto is null then null else nullif(btrim(p_neighborhood), '') end,
         detail = case when v_ponto is null then null else nullif(btrim(p_detail), '') end,
         dropoff_location = nullif(btrim(p_dropoff_location), ''), dropoff_area = nullif(btrim(p_dropoff_area), ''), updated_by = v_actor
   where customer_id = p_customer_id and direction = p_direction and deleted_at is null returning id into v_id;
  if v_id is null then
    insert into customer_habitual_addresses (customer_id, direction, route_point_code, neighborhood, detail, dropoff_location, dropoff_area, created_by, updated_by)
    values (p_customer_id, p_direction, v_ponto,
            case when v_ponto is null then null else nullif(btrim(p_neighborhood), '') end,
            case when v_ponto is null then null else nullif(btrim(p_detail), '') end,
            nullif(btrim(p_dropoff_location), ''), nullif(btrim(p_dropoff_area), ''), v_actor, v_actor) returning id into v_id;
  end if;
  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
  values ('customer_habitual_addresses', v_id, 'update', jsonb_build_object('acao', 'endereco_de_costume_fixado', 'direcao', p_direction, 'ponto', v_ponto, 'bairro', p_neighborhood, 'detalhe', p_detail, 'desembarque', p_dropoff_location), v_actor);
  return jsonb_build_object('success', true, 'id', v_id);
end; $$;

create or replace function public.rpc_instruir_sobre_cliente(
  p_customer_id uuid,
  p_texto text,
  p_substituir boolean default false,
  p_actor uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), case when auth.role() = 'service_role' then p_actor end);
  v_papel text := fn_papel_de(v_actor);
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
  v_atual text;
  v_novo text;
begin
  if v_papel is null or v_papel not in ('admin', 'atendente') then
    return jsonb_build_object('success', false, 'message', 'Só admin ou atendente dá instruções sobre o passageiro.');
  end if;
  if length(v_texto) < 5 or length(v_texto) > 500 then
    return jsonb_build_object('success', false, 'message', 'Instrução curta ou longa demais (5–500 letras).');
  end if;
  if regexp_replace(v_texto, '\D', '', 'g') ~ '\d{8,}' then
    return jsonb_build_object('success', false, 'message', 'A instrução não guarda telefone nem documento.');
  end if;
  select bot_instructions into v_atual from customers where id = p_customer_id and deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Cliente não encontrado.');
  end if;
  v_novo := case when p_substituir or coalesce(btrim(v_atual), '') = '' then '• ' || v_texto
                 else v_atual || E'\n• ' || v_texto end;
  v_novo := right(v_novo, 2000);
  update customers set bot_instructions = v_novo, updated_at = now(), updated_by = v_actor where id = p_customer_id;
  insert into audit_logs (entity_table, entity_id, action, before_data, after_data, performed_by)
  values ('customers', p_customer_id, 'update', jsonb_build_object('bot_instructions', v_atual), jsonb_build_object('bot_instructions', v_novo), v_actor);
  return jsonb_build_object('success', true, 'instrucoes', v_novo, 'message', 'Instrução guardada: o bot e o assistente seguem nos próximos agendamentos.');
end
$$;
revoke all on function public.rpc_instruir_sobre_cliente(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.rpc_instruir_sobre_cliente(uuid, text, boolean, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------
do $$
begin
  if (select (rpc_instruir_sobre_cliente(gen_random_uuid(), 'Teste sem login'))->>'success') <> 'false' then
    raise exception 'instruir sem login gravou';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_habitual_addresses'
             and column_name = 'route_point_code' and is_nullable = 'NO') then
    raise exception 'costume ainda exige ponto';
  end if;
end $$;
