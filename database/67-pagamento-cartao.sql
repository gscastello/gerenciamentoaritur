-- =====================================================================
-- ROTA PIRAPEMAS — 67: CARTÃO COMO FORMA DE PAGAMENTO (#234)
-- =====================================================================
-- Rodar depois de 01–66. Idempotente. Aplicar ANTES de publicar o app e o bot
-- que oferecem a opção. As funções do banco não têm regra presa à forma de
-- pagamento (só o padrão 'dinheiro'), e o comprovante continua exclusivo do Pix.
-- =====================================================================

alter type public.payment_method add value if not exists 'cartao';
