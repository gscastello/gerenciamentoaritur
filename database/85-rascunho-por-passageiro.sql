-- =====================================================================
-- ROTA PIRAPEMAS — 85: UM RASCUNHO POR PASSAGEIRO (#286)
-- =====================================================================
-- Rodar depois de 01–84. Idempotente.
-- A cliente marca a passagem dela e a de outra pessoa (o contato que ela mandou)
-- na mesma viagem: são duas reservas. O índice antigo só deixava um rascunho
-- aberto por conversa, dia e sentido, então o segundo passageiro sumia.
-- =====================================================================

drop index if exists public.uq_reservation_drafts_aberto;
create unique index if not exists uq_reservation_drafts_aberto
  on public.reservation_drafts (conversation_id, trip_date, direction, coalesce(phone, ''))
  where status = 'pronta';
