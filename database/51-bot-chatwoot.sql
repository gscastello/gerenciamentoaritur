-- =====================================================================
-- ROTA PIRAPEMAS — 51: BOT DE WHATSAPP VIA CHATWOOT
-- =====================================================================
-- O número de WhatsApp está no Chatwoot Cloud (Coexistência). Duas colunas
-- novas em whatsapp_conversations:
--   chatwoot_conversation_id  pra onde o bot responde (API do Chatwoot)
--   last_options              opções numeradas oferecidas na última
--                             mensagem ("1 - Ida", "2 - Volta"…), pra
--                             resolver o "1" / "volta" do cliente no id
--                             que o motor de reservas espera (o Chatwoot
--                             não documenta botões/listas pra bot)
--
-- Pré-requisitos: 06-whatsapp.sql e 07-scheduling.sql já aplicados, e o
-- usuário "Bot WhatsApp" criado (Sistema → Equipe, e-mail
-- bot@rota-pirapemas.local, papel atendente).
--
-- Rodar depois de 01-50. Idempotente.
-- =====================================================================

alter table public.whatsapp_conversations
  add column if not exists chatwoot_conversation_id bigint,
  add column if not exists last_options jsonb;

create index if not exists idx_wa_conversations_chatwoot
  on public.whatsapp_conversations (chatwoot_conversation_id)
  where deleted_at is null;
