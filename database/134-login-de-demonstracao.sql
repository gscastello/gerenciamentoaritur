-- 134-login-de-demonstracao.sql — issue #510
--
-- Login de demonstração: papel admin (abre todas as telas) com users.somente_leitura = true.
--   1) fn_antes_do_pedido: o PostgREST chama antes de CADA pedido (pgrst.db_pre_request); se quem pede é
--      só leitura, a transação inteira vira só leitura — vale também para as RPCs security definer (25006).
--   2) segunda camada: gatilho por comando em todas as tabelas de public (se o item 1 sair do ar).
--      Tabela nova fica só com o item 1 até este bloco rodar de novo.
--   3) as Edge Functions que agem com service_role conferem a coluna e recusam (o banco não as vê).
--   4) junto: fn_current_role passa a exigir active. "Desativar" em Equipe só marcava a coluna e o login
--      continuava lendo e gravando.

alter table public.users add column if not exists somente_leitura boolean not null default false;

create or replace function public.fn_current_role()
returns user_role
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select role from users where id = auth.uid() and deleted_at is null and active
$function$;

create or replace function public.fn_somente_leitura()
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from users where id = auth.uid() and somente_leitura)
$function$;
grant execute on function public.fn_somente_leitura() to anon, authenticated, service_role;

create or replace function public.fn_antes_do_pedido()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if fn_somente_leitura() then
    perform set_config('transaction_read_only', 'on', true);
  end if;
end;
$function$;
grant execute on function public.fn_antes_do_pedido() to anon, authenticated, service_role;

create or replace function public.fn_trava_somente_leitura()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if fn_somente_leitura() then
    raise exception 'Login de demonstração: nada é gravado.' using errcode = '25006';
  end if;
  return null;
end;
$function$;
revoke all on function public.fn_trava_somente_leitura() from public, anon, authenticated;

do $do$
declare t record;
begin
  for t in select c.oid::regclass as nome from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('drop trigger if exists trg_somente_leitura on %s', t.nome);
    execute format('create trigger trg_somente_leitura before insert or update or delete on %s
                    for each statement execute function public.fn_trava_somente_leitura()', t.nome);
  end loop;
end
$do$;

alter role authenticator set pgrst.db_pre_request = 'public.fn_antes_do_pedido';
notify pgrst, 'reload config';
