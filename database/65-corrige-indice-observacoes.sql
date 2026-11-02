-- =====================================================================
-- ROTA PIRAPEMAS — 65: CORRIGE O ÍNDICE ÚNICO DAS OBSERVAÇÕES DO BOT (#222)
-- =====================================================================
-- Rodar depois de 64. Idempotente.
-- O upsert do bot (ON CONFLICT (chatwoot_message_id)) não funciona contra um
-- índice único PARCIAL: o Postgres responde 42P10 e nenhuma mensagem de cliente
-- ou da equipe era gravada. O índice comum aceita vários NULL (rascunhos sem id)
-- e é o que o ON CONFLICT precisa.
-- =====================================================================

drop index if exists public.uq_bot_observations_msg;
create unique index if not exists uq_bot_observations_msg
  on public.bot_observations (chatwoot_message_id);

-- Conferir (deve devolver 1 linha, sem WHERE no indexdef):
--   select indexdef from pg_indexes where indexname = 'uq_bot_observations_msg';
