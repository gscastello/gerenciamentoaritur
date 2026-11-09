-- =====================================================================
-- ROTA PIRAPEMAS — 68: RECONHECER O CADASTRO COM VARIAÇÕES DO TELEFONE (#236)
-- =====================================================================
-- Rodar depois de 01–67. Idempotente.
-- A maior parte dos cadastros tem 10 dígitos (sem o nono), mas o app procurava o
-- número exatamente igual ao digitado: o mesmo passageiro virava outro cliente.
-- Agora as RPCs reconhecem o número com e sem o nono dígito, e também no telefone
-- secundário. Criar reserva não troca mais o telefone guardado no cadastro.
--
-- As duas RPCs são longas e a mudança é pequena: em vez de repetir tudo, o bloco
-- abaixo troca só os trechos e PARA com erro se algum não estiver lá.
-- =====================================================================

create or replace function public.fn_normalizar_telefone(p_telefone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with d as (select ltrim(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '0') as v)
  select case when length(v) > 11 and v like '55%' then substring(v from 3) else v end from d;
$$;

-- O cadastro desse número: o igual vem primeiro, depois a outra forma do mesmo
-- celular como telefone principal e, por último, como secundário.
create or replace function public.fn_cliente_por_telefone(p_telefone text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  with v as (
    select public.fn_normalizar_telefone(p_telefone) as igual,
           public.fn_variantes_telefone(p_telefone) as formas
  )
  select c.id
    from public.customers c, v
   where c.deleted_at is null
     and v.igual <> ''
     and (c.phone = any (v.formas) or c.phone_secondary = any (v.formas))
   order by (c.phone = v.igual) desc, (c.phone = any (v.formas)) desc, c.created_at
   limit 1;
$$;
revoke execute on function public.fn_cliente_por_telefone(text) from public, anon, authenticated;
grant  execute on function public.fn_cliente_por_telefone(text) to service_role;

do $do$
declare
  v_criar regprocedure := 'public.rpc_create_reservation(date, trip_direction, text, text, reservation_type, text, integer, numeric, payment_method, text, text, text, text, text, text, reservation_status, jsonb, text, uuid, text, text, text)';
  v_editar regprocedure := 'public.rpc_edit_reservation(uuid, jsonb, integer, jsonb, jsonb, jsonb, jsonb, jsonb, reservation_status, uuid)';
  v_def text;
  v_velho text;
  v_novo text;
begin
  -- criar: acha o cadastro por qualquer forma do número
  v_def := pg_get_functiondef(v_criar);
  if position('fn_cliente_por_telefone' in v_def) = 0 then
    v_velho := 'select id into v_customer_id from customers where phone = v_fone_norm and deleted_at is null;';
    v_novo := 'v_customer_id := fn_cliente_por_telefone(v_fone_norm);';
    if position(v_velho in v_def) = 0 then
      raise exception '68: trecho não encontrado em rpc_create_reservation: %', v_velho;
    end if;
    v_def := replace(v_def, v_velho, v_novo);

    -- antes a busca era exata e esta linha não mudava nada; agora trocaria o número guardado
    v_velho := 'phone = v_fone_norm,';
    v_novo := 'phone = coalesce(phone, v_fone_norm),';
    if position(v_velho in v_def) = 0 then
      raise exception '68: trecho não encontrado em rpc_create_reservation: %', v_velho;
    end if;
    v_def := replace(v_def, v_velho, v_novo);
    execute v_def;
  end if;

  -- editar: o número informado é de outro cadastro? (a outra forma do PRÓPRIO número não conta)
  v_def := pg_get_functiondef(v_editar);
  if position('fn_variantes_telefone' in v_def) = 0 then
    v_velho := 'where phone = v_fone and deleted_at is null and id <> v_cust limit 1;';
    v_novo := 'where deleted_at is null and id <> v_cust
            and (phone = v_fone
                 or ((phone = any (fn_variantes_telefone(v_fone))
                      or phone_secondary = any (fn_variantes_telefone(v_fone)))
                     and not exists (select 1 from customers eu
                                      where eu.id = v_cust
                                        and eu.phone = any (fn_variantes_telefone(v_fone)))))
          order by (phone = v_fone) desc, created_at
          limit 1;';
    if position(v_velho in v_def) = 0 then
      raise exception '68: trecho não encontrado em rpc_edit_reservation: %', v_velho;
    end if;
    execute replace(v_def, v_velho, v_novo);
  end if;
end
$do$;

-- Conferir:
--   select fn_normalizar_telefone('098 98101-2388');   -- '98981012388'
--   select fn_cliente_por_telefone('98 98101-2388');   -- id do cadastro, com ou sem o 9
