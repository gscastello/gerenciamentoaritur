-- 119 — Juntar cadastros repetidos (issue #446, ficha do passageiro do visual v18)
--
-- O mesmo passageiro às vezes tem dois cadastros: o mesmo nome com outro número, ou o mesmo
-- número com e sem o nono dígito. A ficha mostra "Pode ser a mesma pessoa" e a equipe decide:
--
-- 1. fn_possiveis_repetidos(id): os outros cadastros com o mesmo nome (duas palavras ou mais, sem
--    o nome provisório "Passageiro (…)") ou com o telefone batendo (variantes com e sem o 9, e o
--    2º telefone). Os pares marcados "não é" saem da lista. Security invoker (vale o RLS).
-- 2. cadastros_distintos + rpc_marcar_cadastros_distintos(a, b): "Não é a mesma pessoa".
-- 3. rpc_juntar_cadastros(manter, remover), só admin: tudo o que é do cadastro que sai passa para o
--    que fica — reservas (mesmo as canceladas), conversas, avisos, comprovantes, pendências,
--    rascunhos, revisões, notificações; anotação do bot e endereço de costume sem perder o que o
--    que fica já tinha; o telefone do que sai vira o 2º telefone (se o que fica não tem), notas e
--    instruções do bot se somam, o nome provisório é trocado pelo de verdade. O que sai é
--    APAGADO SÓ LOGICAMENTE (deleted_at), nunca com DELETE, e tudo fica no audit_logs.

create table if not exists public.cadastros_distintos (
  cliente_a uuid not null references public.customers (id),
  cliente_b uuid not null references public.customers (id),
  marcado_por uuid references public.users (id),
  marcado_em timestamptz not null default now(),
  primary key (cliente_a, cliente_b),
  check (cliente_a < cliente_b)
);
alter table public.cadastros_distintos enable row level security;
drop policy if exists cadastros_distintos_select on public.cadastros_distintos;
create policy cadastros_distintos_select on public.cadastros_distintos
  for select to authenticated
  using (coalesce(fn_has_role(array['admin', 'atendente', 'financeiro']::user_role[]), false));
revoke all on public.cadastros_distintos from anon;
grant select on public.cadastros_distintos to authenticated;

create or replace function public.fn_possiveis_repetidos(p_customer_id uuid)
returns table (customer_id uuid, nome text, telefone text, viagens bigint, motivo text)
language sql
stable
security invoker
set search_path = public
as $$
  with eu as (
    select c.id, lower(btrim(c.name)) as nome, c.phone, c.phone_secondary
    from customers c
    where c.id = p_customer_id and c.deleted_at is null
  )
  select o.id, o.name, o.phone,
         (select count(*) from reservations r
           where r.customer_id = o.id and r.deleted_at is null and r.type = 'passagem'
             and r.status in ('confirmada', 'embarcado')) as viagens,
         case
           when fn_normalizar_telefone(o.phone) = any (fn_variantes_telefone(eu.phone))
             or (o.phone_secondary is not null
                 and fn_normalizar_telefone(o.phone_secondary) = any (fn_variantes_telefone(eu.phone)))
             or (eu.phone_secondary is not null
                 and fn_normalizar_telefone(o.phone) = any (fn_variantes_telefone(eu.phone_secondary)))
             then 'mesmo telefone'
           else 'mesmo nome com outro número'
         end as motivo
  from eu
  join customers o on o.id <> eu.id and o.deleted_at is null
  where (
      (eu.nome ~ '\S+\s+\S+' and eu.nome !~* '^passageiro(\s*\(.*\))?$'
       and lower(btrim(o.name)) = eu.nome)
      or fn_normalizar_telefone(o.phone) = any (fn_variantes_telefone(eu.phone))
      or (o.phone_secondary is not null
          and fn_normalizar_telefone(o.phone_secondary) = any (fn_variantes_telefone(eu.phone)))
      or (eu.phone_secondary is not null
          and fn_normalizar_telefone(o.phone) = any (fn_variantes_telefone(eu.phone_secondary)))
    )
    and not exists (
      select 1 from cadastros_distintos d
      where d.cliente_a = least(eu.id, o.id) and d.cliente_b = greatest(eu.id, o.id)
    )
  order by viagens desc
  limit 5;
$$;
revoke all on function public.fn_possiveis_repetidos(uuid) from public, anon;
grant execute on function public.fn_possiveis_repetidos(uuid) to authenticated;

create or replace function public.rpc_marcar_cadastros_distintos(p_a uuid, p_b uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'SEM_PERMISSAO');
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    return jsonb_build_object('success', false, 'message', 'CADASTROS_INVALIDOS');
  end if;
  insert into cadastros_distintos (cliente_a, cliente_b, marcado_por)
  values (least(p_a, p_b), greatest(p_a, p_b), auth.uid())
  on conflict do nothing;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.rpc_marcar_cadastros_distintos(uuid, uuid) from public, anon;
grant execute on function public.rpc_marcar_cadastros_distintos(uuid, uuid) to authenticated;

create or replace function public.rpc_juntar_cadastros(p_manter uuid, p_remover uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_fica customers%rowtype;
  v_sai customers%rowtype;
  v_reservas int;
  v_nota_sai text;
  v_dir trip_direction;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'SEM_PERMISSAO');
  end if;
  if p_manter is null or p_remover is null or p_manter = p_remover then
    return jsonb_build_object('success', false, 'message', 'CADASTROS_INVALIDOS');
  end if;
  select * into v_fica from customers where id = p_manter and deleted_at is null for update;
  select * into v_sai from customers where id = p_remover and deleted_at is null for update;
  if v_fica.id is null or v_sai.id is null then
    return jsonb_build_object('success', false, 'message', 'CADASTRO_NAO_ENCONTRADO');
  end if;

  -- reservas (todas, inclusive as canceladas e as da lixeira: o histórico vai junto)
  update reservations set customer_id = p_manter, updated_by = v_actor
  where customer_id = p_remover;
  get diagnostics v_reservas = row_count;

  update whatsapp_conversations set customer_id = p_manter where customer_id = p_remover;
  update avisos_passageiros set customer_id = p_manter where customer_id = p_remover;
  update comprovantes_pix set customer_id = p_manter where customer_id = p_remover;
  update support_tickets set customer_id = p_manter where customer_id = p_remover;
  update reservation_drafts set customer_id = p_manter where customer_id = p_remover;
  update revisoes_reservas set customer_id = p_manter where customer_id = p_remover;
  update notifications set customer_id = p_manter where customer_id = p_remover;

  -- a anotação do bot é uma por passageiro: a do que sai soma na do que fica
  select notes into v_nota_sai from bot_customer_notes where customer_id = p_remover;
  if found then
    if exists (select 1 from bot_customer_notes where customer_id = p_manter) then
      update bot_customer_notes
         set notes = concat_ws(E'\n', nullif(notes, ''), nullif(v_nota_sai, '')), updated_at = now()
       where customer_id = p_manter;
      delete from bot_customer_notes where customer_id = p_remover;
    else
      update bot_customer_notes set customer_id = p_manter where customer_id = p_remover;
    end if;
  end if;

  -- endereço de costume: um por sentido; vale o do que fica, o do que sai só entra se faltar
  for v_dir in select distinct direction from customer_habitual_addresses
               where customer_id = p_remover and deleted_at is null loop
    if exists (select 1 from customer_habitual_addresses
               where customer_id = p_manter and direction = v_dir and deleted_at is null) then
      update customer_habitual_addresses set deleted_at = now()
       where customer_id = p_remover and direction = v_dir and deleted_at is null;
    else
      update customer_habitual_addresses set customer_id = p_manter
       where customer_id = p_remover and direction = v_dir and deleted_at is null;
    end if;
  end loop;

  -- o cadastro que sai some da lista (apagado só logicamente) antes de o telefone dele virar o
  -- 2º telefone do que fica
  update customers
     set deleted_at = now(), updated_by = v_actor,
         notes = concat_ws(E'\n', nullif(notes, ''), format('Juntado ao cadastro %s em %s.', p_manter,
                           to_char(now() at time zone 'America/Fortaleza', 'DD/MM/YYYY HH24:MI')))
   where id = p_remover;

  update customers
     set name = case
                  when name is null or btrim(name) = '' or name ~* '^passageiro(\s*\(.*\))?$'
                    then coalesce(nullif(btrim(v_sai.name), ''), name)
                  else name
                end,
         phone_secondary = coalesce(
           phone_secondary,
           case when fn_normalizar_telefone(v_sai.phone) <> all (fn_variantes_telefone(phone))
                then v_sai.phone end,
           v_sai.phone_secondary),
         notes = concat_ws(E'\n', nullif(notes, ''), nullif(v_sai.notes, '')),
         bot_instructions = concat_ws(E'\n', nullif(bot_instructions, ''), nullif(v_sai.bot_instructions, '')),
         tags = (select coalesce(jsonb_agg(distinct e.v), '[]'::jsonb)
                 from jsonb_array_elements(coalesce(tags, '[]'::jsonb) || coalesce(v_sai.tags, '[]'::jsonb)) as e(v)),
         default_route_point_code = coalesce(default_route_point_code, v_sai.default_route_point_code),
         default_payment_method = coalesce(default_payment_method, v_sai.default_payment_method),
         default_neighborhood = coalesce(default_neighborhood, v_sai.default_neighborhood),
         email = coalesce(email, v_sai.email),
         updated_by = v_actor
   where id = p_manter;

  insert into audit_logs (entity_table, entity_id, action, before_data, after_data, performed_by)
  values ('customers', p_remover, 'update', to_jsonb(v_sai),
          jsonb_build_object('juntado_em', p_manter, 'reservas_movidas', v_reservas), v_actor);

  return jsonb_build_object('success', true, 'reservas', v_reservas, 'customer_id', p_manter);
end;
$$;
revoke all on function public.rpc_juntar_cadastros(uuid, uuid) from public, anon;
grant execute on function public.rpc_juntar_cadastros(uuid, uuid) to authenticated;

-- Trava: anon não chama nada disto e o cadastro que sai nunca é apagado de verdade.
do $$
begin
  if has_function_privilege('anon', 'public.rpc_juntar_cadastros(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.fn_possiveis_repetidos(uuid)', 'execute')
     or has_function_privilege('anon', 'public.rpc_marcar_cadastros_distintos(uuid, uuid)', 'execute') then
    raise exception 'anon não pode chamar as funções de cadastro repetido';
  end if;
  if pg_get_functiondef('public.rpc_juntar_cadastros(uuid, uuid)'::regprocedure) ~* 'delete\s+from\s+customers' then
    raise exception 'juntar cadastros não pode apagar o cliente de verdade';
  end if;
end $$;
