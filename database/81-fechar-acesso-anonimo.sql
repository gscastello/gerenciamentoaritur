-- =====================================================================
-- ROTA PIRAPEMAS — 81: FECHAR O ACESSO ANÔNIMO (auditoria de 10/11/2026)
-- =====================================================================
-- Rodar depois de 01–80. Idempotente.
-- A chave pública (anon) fica no navegador. A auditoria achou:
--   1) rpc_endereco_de_costume / rpc_definir_… / rpc_limpar_… liberavam a chamada
--      quando não há usuário logado (para o bot, que usa a service_role) — mas o
--      anônimo também não tem usuário: dava para LER e ALTERAR o endereço de costume
--      de um cliente sem login (sabendo o id dele).
--   2) settings era legível sem login (telefone do motorista, conta do Chatwoot).
--   3) funções novas nasciam com EXECUTE para anon/PUBLIC (padrão do Supabase).
-- O app só usa essas coisas depois do login; o bot usa a service_role.
-- =====================================================================

-- 1) funções que o anônimo nunca deve chamar
revoke execute on function public.rpc_endereco_de_costume(uuid) from public, anon;
revoke execute on function public.rpc_definir_endereco_de_costume(uuid, public.trip_direction, text, text, text, text, text) from public, anon;
revoke execute on function public.rpc_limpar_endereco_de_costume(uuid, public.trip_direction) from public, anon;
revoke execute on function public.fn_fechar_rascunho_ao_reservar() from public, anon, authenticated;
revoke execute on function public.fn_trg_aprender_lugares() from public, anon, authenticated;
grant execute on function public.rpc_endereco_de_costume(uuid) to authenticated, service_role;
grant execute on function public.rpc_definir_endereco_de_costume(uuid, public.trip_direction, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.rpc_limpar_endereco_de_costume(uuid, public.trip_direction) to authenticated, service_role;

-- 3) daqui para a frente, função nova não nasce liberada para o anônimo
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 2) configurações só para quem fez login
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated using (true);
revoke select on public.settings from anon;

-- funções sem search_path fixo (alerta do Supabase)
alter function public.fn_distancia_palavra(text, text) set search_path = public;
alter function public.fn_palavras_de_lugar() set search_path = public;
do $$ begin
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_is_extra';
  if found then
    execute (select format('alter function public.fn_is_extra(%s) set search_path = public', pg_get_function_identity_arguments(p.oid))
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'fn_is_extra' limit 1);
  end if;
end $$;

-- Conferir (como anônimo, deve dar "permission denied"):
--   set role anon; select public.rpc_endereco_de_costume('<id>'); reset role;
