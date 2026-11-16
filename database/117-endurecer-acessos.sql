-- 117-endurecer-acessos.sql — auditoria de 16/11/2026 (issue #444)
--
-- Achados da auditoria no banco de produção, todos pequenos e sem mudar regra de negócio:
--
-- 1. Remover bairro falhava ("permission denied for table neighborhood_pricing", 3 vezes no
--    registro de erros em 12/11): a política de DELETE para admin existe, faltava o grant.
-- 2. rpc_transfer_to_human e rpc_return_to_ai não conferiam o papel de quem chama e aceitavam
--    qualquer p_actor: qualquer usuário logado mudava o modo de uma conversa em nome de outro.
--    Agora, chamada com login exige admin/atendente e o autor é sempre quem está logado; o bot
--    (service_role, sem login) continua informando o autor, como em rpc_cancel_reservation.
-- 3. Funções de gatilho (fn_avisar_consumo, fn_trg_aprender_sao_luis) eram executáveis pela API
--    por qualquer um, inclusive sem login. Gatilho não precisa de EXECUTE para disparar.
-- 4. Quem não está logado (anon) tinha grant em quase todas as tabelas. As políticas já barravam
--    (elas chamam fn_current_role, que anon não executa), mas a única trava era essa. Agora anon
--    não tem grant em tabela nenhuma: o app só lê e grava depois do login. As duas políticas
--    "true" (bairros e tipos de manutenção, legíveis sem login) passam a valer só para logados.
-- 5. audit_insert aceitava INSERT de qualquer papel; fica só para logados (o gatilho de auditoria
--    roda como o usuário logado; service_role não passa por RLS).

-- 1 -----------------------------------------------------------------------------------------
grant delete on public.neighborhood_pricing to authenticated;

-- 2 -----------------------------------------------------------------------------------------
create or replace function public.rpc_transfer_to_human(
  p_conversation_id uuid, p_reason text default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  update whatsapp_conversations
    set attendance_mode = 'humano', assigned_user_id = v_actor, updated_by = v_actor
    where id = p_conversation_id;

  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
    values ('whatsapp_conversations', p_conversation_id, 'status_change',
            jsonb_build_object('attendance_mode', 'humano', 'reason', p_reason), v_actor);

  return jsonb_build_object('success', true);
end;
$function$;

create or replace function public.rpc_return_to_ai(
  p_conversation_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_actor uuid;
begin
  if auth.uid() is not null
     and not coalesce(fn_has_role(array['admin','atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  v_actor := coalesce(auth.uid(), p_actor);

  update whatsapp_conversations
    set attendance_mode = 'ia', assigned_user_id = null, updated_by = v_actor
    where id = p_conversation_id;
  insert into audit_logs (entity_table, entity_id, action, after_data, performed_by)
    values ('whatsapp_conversations', p_conversation_id, 'status_change',
            jsonb_build_object('attendance_mode', 'ia'), v_actor);
  return jsonb_build_object('success', true);
end;
$function$;

-- 3 -----------------------------------------------------------------------------------------
revoke execute on function public.fn_avisar_consumo() from public, anon, authenticated;
revoke execute on function public.fn_trg_aprender_sao_luis() from public, anon, authenticated;

-- 4 -----------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

alter policy neighborhood_pricing_select on public.neighborhood_pricing to authenticated;
alter policy maintenance_types_select on public.maintenance_types to authenticated;

-- 5 -----------------------------------------------------------------------------------------
alter policy audit_insert on public.audit_logs to authenticated;

-- Travas: se algo acima não ficou como esperado, a migração inteira volta.
do $$
begin
  if not has_table_privilege('authenticated', 'public.neighborhood_pricing', 'DELETE') then
    raise exception 'grant de DELETE em neighborhood_pricing não ficou';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))
  ) then
    raise exception 'anon ainda tem grant em alguma tabela/visão';
  end if;
  if has_function_privilege('anon', 'public.fn_avisar_consumo()', 'execute')
     or has_function_privilege('authenticated', 'public.fn_trg_aprender_sao_luis()', 'execute') then
    raise exception 'função de gatilho ainda executável pela API';
  end if;
  -- o app logado continua lendo o que lia
  if not has_table_privilege('authenticated', 'public.reservations', 'SELECT')
     or not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT') then
    raise exception 'grant de authenticated mudou sem querer';
  end if;
end $$;
