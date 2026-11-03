-- =====================================================================
-- ROTA PIRAPEMAS — 66: ENDEREÇO DE COSTUME DO CLIENTE RECORRENTE (#228)
-- =====================================================================
-- Rodar depois de 01–65. Idempotente.
-- Agendamento rápido (1 clique no app, resumo pronto no bot) para quem viaja
-- sempre do mesmo lugar. O "endereço de costume" é POR CLIENTE e POR SENTIDO
-- (Ida e Volta separados) e vem de duas fontes, nesta ordem:
--   1) MANUAL  — a equipe fixa no app (customer_habitual_addresses). Vale sempre.
--   2) HISTÓRICO — o local mais frequente (empate: o mais recente) entre as
--      reservas confirmadas/embarcadas do cliente naquele sentido, desde que ele
--      tenha pelo menos 2. Grafia parecida ("Prime Calhau", "prime  calhau") conta
--      como o mesmo local (fn_normalizar_local).
-- Uma única regra no banco: o app e o bot chamam rpc_endereco_de_costume, então
-- nunca divergem. Preço e vaga NÃO são decididos aqui — continuam saindo da
-- tabela do sistema e de rpc_create_reservation. Remover um endereço fixado é
-- soft-delete (o histórico fica).
-- =====================================================================

create table if not exists public.customer_habitual_addresses (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id),
  direction        trip_direction not null,
  route_point_code text not null,
  neighborhood     text,
  detail           text,
  dropoff_location text,
  dropoff_area     text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.users(id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id),
  deleted_at       timestamptz
);

create unique index if not exists uq_customer_habitual_cliente_sentido
  on public.customer_habitual_addresses (customer_id, direction)
  where deleted_at is null;

drop trigger if exists trg_customer_habitual_updated_at on public.customer_habitual_addresses;
create trigger trg_customer_habitual_updated_at
  before update on public.customer_habitual_addresses
  for each row execute function fn_set_updated_at();

alter table public.customer_habitual_addresses enable row level security;

drop policy if exists customer_habitual_select on public.customer_habitual_addresses;
create policy customer_habitual_select on public.customer_habitual_addresses
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

-- escrita só pelas RPCs abaixo (security definer) e pelo service_role
grant select on public.customer_habitual_addresses to authenticated;

-- ---------------------------------------------------------------------
-- Texto de local comparável: minúsculas, sem acento, só letras/números,
-- espaços colapsados. NÃO tira números/romanos ("Cohab Anil II" ≠ "III").
-- ---------------------------------------------------------------------
create or replace function public.fn_normalizar_local(p_texto text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_texto, '')),
              'áàâãäéèêëíìîïóòôõöúùûüç',
              'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

grant execute on function public.fn_normalizar_local(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Endereço de costume de um cliente: { success, ida, volta, sentido_sugerido }.
-- Cada sentido é null (sem costume) ou
--   { fonte: 'manual'|'historico', route_point_code, route_point_name,
--     neighborhood, detail, dropoff_location, dropoff_area, vezes, ultima_data }
-- sentido_sugerido = o oposto da última viagem do cliente (ida→volta, volta→ida).
-- ---------------------------------------------------------------------
create or replace function public.rpc_endereco_de_costume(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res        jsonb := jsonb_build_object('success', true, 'ida', null, 'volta', null);
  v_dir        trip_direction;
  v_man        record;
  v_rep        record;
  v_last_dir   trip_direction;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;

  foreach v_dir in array array['ida', 'volta']::trip_direction[] loop
    -- 1) fixado pela equipe
    select h.route_point_code, rp.name as route_point_name, h.neighborhood, h.detail,
           h.dropoff_location, h.dropoff_area
      into v_man
      from customer_habitual_addresses h
      left join route_points rp
        on rp.code = h.route_point_code and rp.direction = h.direction and rp.deleted_at is null
     where h.customer_id = p_customer_id and h.direction = v_dir and h.deleted_at is null;
    if found then
      v_res := jsonb_set(v_res, array[v_dir::text], jsonb_build_object(
        'fonte', 'manual',
        'route_point_code', v_man.route_point_code,
        'route_point_name', v_man.route_point_name,
        'neighborhood', v_man.neighborhood,
        'detail', v_man.detail,
        'dropoff_location', v_man.dropoff_location,
        'dropoff_area', v_man.dropoff_area));
      continue;
    end if;

    -- 2) histórico: local mais frequente (empate → o mais recente), com pelo menos 2 viagens no sentido
    with hist as (
      select rp.code as codigo, rp.name as nome, r.pickup_neighborhood as bairro, r.pickup_detail as detalhe,
             r.dropoff_location as desembarque, r.dropoff_area as area, t.trip_date as data,
             r.created_at as criado,
             fn_normalizar_local(concat_ws(' ', rp.code, r.pickup_neighborhood, r.pickup_detail)) as chave
        from reservations r
        join trips t on t.id = r.trip_id
        join route_points rp on rp.id = r.route_point_id
       where r.customer_id = p_customer_id
         and r.type = 'passagem'
         and r.deleted_at is null
         and r.status in ('confirmada', 'embarcado')
         and t.direction = v_dir
    ),
    grupos as (
      select chave, count(*) as vezes, max(data) as ult, max(criado) as cr
        from hist group by chave
       order by count(*) desc, max(data) desc, max(criado) desc
       limit 1
    )
    select (select count(*) from hist) as total, g.vezes, rep.*
      into v_rep
      from grupos g
      cross join lateral (
        select h.* from hist h where h.chave = g.chave order by h.data desc, h.criado desc limit 1
      ) rep;
    if found and v_rep.total >= 2 then
      v_res := jsonb_set(v_res, array[v_dir::text], jsonb_build_object(
        'fonte', 'historico',
        'route_point_code', v_rep.codigo,
        'route_point_name', v_rep.nome,
        'neighborhood', nullif(btrim(v_rep.bairro), ''),
        'detail', nullif(btrim(v_rep.detalhe), ''),
        'dropoff_location', nullif(btrim(v_rep.desembarque), ''),
        'dropoff_area', nullif(btrim(v_rep.area), ''),
        'vezes', v_rep.vezes,
        'ultima_data', v_rep.data));
    end if;
  end loop;

  select t.direction into v_last_dir
    from reservations r
    join trips t on t.id = r.trip_id
   where r.customer_id = p_customer_id
     and r.type = 'passagem'
     and r.deleted_at is null
     and r.status in ('confirmada', 'embarcado')
   order by t.trip_date desc, r.created_at desc
   limit 1;
  v_res := v_res || jsonb_build_object(
    'sentido_sugerido',
    case v_last_dir when 'ida' then 'volta' when 'volta' then 'ida' else null end);

  return v_res;
end;
$$;

grant execute on function public.rpc_endereco_de_costume(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- A equipe fixa (ou corrige) o endereço de costume de um sentido.
-- ---------------------------------------------------------------------
create or replace function public.rpc_definir_endereco_de_costume(
  p_customer_id      uuid,
  p_direction        trip_direction,
  p_route_point_code text,
  p_neighborhood     text default null,
  p_detail           text default null,
  p_dropoff_location text default null,
  p_dropoff_area     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is not null
     and not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and deleted_at is null) then
    return jsonb_build_object('success', false, 'message', 'Cliente não encontrado.');
  end if;
  if not exists (
    select 1 from route_points
     where code = p_route_point_code and direction = p_direction and deleted_at is null
  ) then
    return jsonb_build_object('success', false, 'message', 'Ponto de embarque inexistente nesse sentido.');
  end if;

  update customer_habitual_addresses
     set route_point_code = p_route_point_code,
         neighborhood     = nullif(btrim(p_neighborhood), ''),
         detail           = nullif(btrim(p_detail), ''),
         dropoff_location = nullif(btrim(p_dropoff_location), ''),
         dropoff_area     = nullif(btrim(p_dropoff_area), ''),
         updated_by       = v_actor
   where customer_id = p_customer_id and direction = p_direction and deleted_at is null
   returning id into v_id;

  if v_id is null then
    insert into customer_habitual_addresses
      (customer_id, direction, route_point_code, neighborhood, detail, dropoff_location, dropoff_area,
       created_by, updated_by)
    values
      (p_customer_id, p_direction, p_route_point_code, nullif(btrim(p_neighborhood), ''),
       nullif(btrim(p_detail), ''), nullif(btrim(p_dropoff_location), ''), nullif(btrim(p_dropoff_area), ''),
       v_actor, v_actor)
    returning id into v_id;
  end if;

  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
  values ('customer_habitual_addresses', v_id, 'update',
          jsonb_build_object('acao', 'endereco_de_costume_fixado', 'direcao', p_direction,
                             'ponto', p_route_point_code, 'bairro', p_neighborhood, 'detalhe', p_detail,
                             'desembarque', p_dropoff_location),
          v_actor);

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

grant execute on function public.rpc_definir_endereco_de_costume(uuid, trip_direction, text, text, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Solta o endereço fixado: o sentido volta a usar o que vem do histórico.
-- ---------------------------------------------------------------------
create or replace function public.rpc_limpar_endereco_de_costume(
  p_customer_id uuid,
  p_direction   trip_direction
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is not null
     and not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;

  update customer_habitual_addresses
     set deleted_at = now(), updated_by = v_actor
   where customer_id = p_customer_id and direction = p_direction and deleted_at is null
   returning id into v_id;

  if v_id is not null then
    insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
    values ('customer_habitual_addresses', v_id, 'update',
            jsonb_build_object('acao', 'endereco_de_costume_solto', 'direcao', p_direction), v_actor);
  end if;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.rpc_limpar_endereco_de_costume(uuid, trip_direction)
  to authenticated, service_role;

-- Conferir:
--   select rpc_endereco_de_costume((select id from customers where name ilike 'Adriely Luce%' limit 1));
