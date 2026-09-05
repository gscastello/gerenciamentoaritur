-- =====================================================================
-- ROTA PIRAPEMAS — 16: fuso horário do banco = São Luís (MA)
-- =====================================================================
-- Rodar depois de 01–15. Precisa de privilégio pra alterar o banco
-- (normalmente só dá pelo painel/API do Supabase, não pelo SQL Editor).
--
-- O Postgres do Supabase roda em UTC por padrão. A operação é em São Luís
-- (MA) — UTC-3 o ano inteiro, já que o Brasil não observa mais horário de
-- verão desde 2019. Sem isso, current_date/now() "adiantam" 3 horas em
-- relação ao dia civil de São Luís: das 21h à meia-noite (hora local), o
-- banco já acha que é amanhã. Isso afetava:
--   - fn_ensure_upcoming_trips / rpc_ensure_trips (horizonte de viagens)
--   - rpc_create_reservation (get-or-create da viagem "de hoje")
--   - qualquer lógica futura baseada em current_date/now() sem fuso
--     explícito (ex.: os lembretes de WhatsApp em 07-scheduling.sql)
--
-- Isto NÃO muda nenhum dado já gravado — timestamptz guarda o instante
-- absoluto, só a INTERPRETAÇÃO de current_date/now() em novas sessões
-- passa a ser em América/Fortaleza.

alter database postgres set timezone to 'America/Fortaleza';

-- Conferir (numa sessão NOVA — a atual pode já ter o timezone antigo em cache):
--   show timezone;                    -- esperado: America/Fortaleza
--   select now(), current_date;       -- esperado: hora/dia de São Luís
