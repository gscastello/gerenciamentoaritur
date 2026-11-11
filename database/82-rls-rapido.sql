-- =====================================================================
-- ROTA PIRAPEMAS — 82: REGRAS DE ACESSO (RLS) RÁPIDAS (auditoria de 10/11/2026)
-- =====================================================================
-- Rodar depois de 01–81. Idempotente (rodar de novo não muda nada).
-- As regras chamavam fn_has_role(...) / fn_current_role() / fn_current_driver_id()
-- direto, e o Postgres avaliava a função UMA VEZ POR LINHA (cada chamada lê a
-- tabela users). Com 780 reservas, a lista do app levava ~0,4–0,8 s no banco e,
-- com o app consultando a cada 8 s em cada tela aberta, o banco ficava ocupado
-- o tempo todo — origem da instabilidade (buscas do bot falhando).
-- Envolver a chamada em (select …) faz o Postgres calcular uma vez por consulta
-- (recomendação do Supabase, "RLS performance"). Quem vê o quê NÃO muda.
-- Medido: reservas + pendências + notificações de 1.506 ms para 10 ms.
-- =====================================================================

do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select pol.polname, cl.relname,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as chk
    from pg_policy pol
    join pg_class cl on cl.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public'
  loop
    q := p.qual;
    c := p.chk;
    -- (?<![Ss][Ee][Ll][Ee][Cc][Tt] ) não embrulha de novo o que já está embrulhado
    q := regexp_replace(q, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_has_role\((ARRAY\[[^\]]*\](::user_role\[\])?)\)', '(select fn_has_role(\1))', 'g');
    q := regexp_replace(q, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_current_role\(\)', '(select fn_current_role())', 'g');
    q := regexp_replace(q, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_current_driver_id\(\)', '(select fn_current_driver_id())', 'g');
    c := regexp_replace(c, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_has_role\((ARRAY\[[^\]]*\](::user_role\[\])?)\)', '(select fn_has_role(\1))', 'g');
    c := regexp_replace(c, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_current_role\(\)', '(select fn_current_role())', 'g');
    c := regexp_replace(c, '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_current_driver_id\(\)', '(select fn_current_driver_id())', 'g');
    if q is distinct from p.qual or c is distinct from p.chk then
      execute format('alter policy %I on public.%I %s %s', p.polname, p.relname,
        case when q is not null then format('using (%s)', q) else '' end,
        case when c is not null then format('with check (%s)', c) else '' end);
    end if;
  end loop;
end $$;

-- Conferir:
--   select count(*) from pg_policy where pg_get_expr(polqual, polrelid) ~ '(?<![Ss][Ee][Ll][Ee][Cc][Tt] )fn_has_role\(';  -- 0
