-- =====================================================================
-- ROTA PIRAPEMAS — 27: FECHAR AS FUNÇÕES DE GATILHO FINANCEIRAS À API
-- =====================================================================
-- Advisor do Supabase (lint 0028/0029): estas 3 funções são
-- SECURITY DEFINER e ficaram com EXECUTE para public/anon/authenticated,
-- ou seja, chamáveis SEM LOGIN via /rest/v1/rpc/<nome>. As migrações 13 e
-- 18 esqueceram o `revoke` — o irmão `fn_ensure_reservation_revenue` já
-- tinha (18, linha 47).
--
-- São funções de TRIGGER: o gatilho dispara independentemente de o
-- chamador ter privilégio EXECUTE (o Postgres não checa EXECUTE quando a
-- função roda como trigger). Revogar não quebra a automação financeira —
-- só tira a superfície de API indevida.
--
-- Rodar depois de 01-26. Idempotente.
-- =====================================================================

revoke execute on function public.fn_reservation_confirmed_to_revenue() from public, anon, authenticated;
revoke execute on function public.fn_reservation_cancelled_to_reversal() from public, anon, authenticated;
revoke execute on function public.fn_payment_to_financial_entry()        from public, anon, authenticated;

-- Conferir (esperado: sem `=X` de PUBLIC, sem anon, sem authenticated):
--   select proname, proacl::text from pg_proc
--   where proname in ('fn_reservation_confirmed_to_revenue',
--                     'fn_reservation_cancelled_to_reversal',
--                     'fn_payment_to_financial_entry');
-- Conferir que os gatilhos seguem ativos:
--   select tgname, tgenabled from pg_trigger
--   where tgname in ('trg_reservation_confirmed_to_revenue',
--                    'trg_reservation_cancelled_to_reversal',
--                    'trg_payment_financial_entry');
