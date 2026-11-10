-- =====================================================================
-- ROTA PIRAPEMAS — 80: O BOT APRENDE TAMBÉM COM OS CLIENTES (#278)
-- =====================================================================
-- Rodar depois de 01–79. O ALTER é idempotente; o UPDATE do fim só faz sentido na
-- primeira vez (rodar de novo apenas relê as mesmas conversas).
-- Novo tipo de lição: o que os CLIENTES contam e serve para atender outros clientes
-- (lugares e referências, localidades, necessidades, épocas e motivos de viagem,
-- dúvidas e reclamações que se repetem). Vale na hora para ENTENDER e CONFIRMAR;
-- nunca vira preço, valor, horário ou regra (o filtro do bot descarta).
-- =====================================================================

alter table public.bot_learnings drop constraint if exists bot_learnings_kind_check;
alter table public.bot_learnings add constraint bot_learnings_kind_check
  check (kind in ('linguagem_cliente', 'estilo_atendente', 'fluxo_agendamento', 'situacao', 'operacao', 'fato', 'negocio',
                  'dito_pelo_cliente'));

-- A última semana foi lida antes deste tipo existir: volta para o próximo aprendizado.
update public.bot_observations
   set processed_at = null
 where processed_at is not null
   and created_at > now() - interval '7 days';

-- Conferir:
--   select kind, status, title from bot_learnings where kind = 'dito_pelo_cliente';
--   select count(*) from bot_observations where processed_at is null;
