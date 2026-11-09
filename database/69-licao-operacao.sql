-- =====================================================================
-- ROTA PIRAPEMAS — 69: LIÇÕES DE OPERAÇÃO (#238)
-- =====================================================================
-- Rodar depois de 01–68. O ALTER é idempotente; o UPDATE do fim só faz sentido na
-- primeira vez (rodar de novo apenas relê as mesmas conversas).
-- Novo tipo de lição: como a viagem funciona no dia a dia, do jeito que o atendente
-- disse ao cliente (onde a van para, plataforma, horários de chegada e de passagem).
-- Vale na hora e pede conferência; se citar dinheiro, nasce como proposta.
-- =====================================================================

alter table public.bot_learnings drop constraint if exists bot_learnings_kind_check;
alter table public.bot_learnings add constraint bot_learnings_kind_check
  check (kind in ('linguagem_cliente', 'estilo_atendente', 'fluxo_agendamento', 'situacao', 'operacao', 'fato', 'negocio'));

-- As conversas dos últimos 30 dias em que o atendente falou de parada, plataforma ou
-- horário já foram lidas antes de este tipo existir: voltam para o próximo aprendizado.
update public.bot_observations
   set processed_at = null
 where processed_at is not null
   and chatwoot_conversation_id in (
     select chatwoot_conversation_id
       from public.bot_observations
      where author = 'equipe'
        and created_at > now() - interval '30 days'
        and content ~* '(plataforma|parada|paramos|chegamos|chega |chegada|sa[ií]mos|passamos)'
   )
   and created_at > now() - interval '30 days';

-- Conferir:
--   select kind, status, title from bot_learnings where kind = 'operacao';
--   select count(*) from bot_observations where processed_at is null;
