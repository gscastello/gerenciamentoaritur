-- 141 — Aprendizado 1 vez por dia (issue #537, redução de custos, dono 25/11)
--
-- (O revisor chegou a esperar 6 min com a viagem longe; o dono quer o atendimento na hora: voltou a 45 s, como em 109.)

-- Aprendizado 1 vez por dia (era a cada 6 h): vale já, mesmo para a versão do bot que ainda pede 6 horas.
create or replace function public.fn_bot_learning_try_start(p_min_hours integer default 24)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_n integer;
begin
  update settings
     set value = jsonb_build_object('last_run_at', now())
   where key = 'bot_learning_state'
     and (value ->> 'last_run_at')::timestamptz < now() - make_interval(hours => greatest(p_min_hours, 24));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;
revoke all on function public.fn_bot_learning_try_start(integer) from public, anon, authenticated;
grant execute on function public.fn_bot_learning_try_start(integer) to service_role;
