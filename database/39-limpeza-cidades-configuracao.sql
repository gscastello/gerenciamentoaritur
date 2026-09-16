-- =====================================================================
-- ROTA PIRAPEMAS — 39: LIMPEZA DE CIDADES DUPLICADAS EM CONFIGURAÇÕES
-- =====================================================================
-- Achado da auditoria de 2026-09-16: served_cities e intermediate_cities
-- guardavam a MESMA cidade duas vezes (com e sem acento — "são luís" e
-- "sao luis", "matões" e "matoes"), resquício de antes do editor de
-- cidades (aba Sistema → ListaChips, App.jsx) normalizar toda entrada
-- nova. Ele já normaliza (minúsculas/sem acento, ver useSettings.js) e
-- recusa duplicata desde então — isso não volta a acontecer sozinho.
--
-- Nunca afetou o comportamento: a comparação (foraDaAreaPadrao,
-- domain/cidades.js) já normaliza os dois lados antes de comparar — só a
-- lista em si ficava redundante e confusa pra quem edita.
--
-- Idempotente (UPDATE com valor final fixo).
-- =====================================================================

update settings set value = '["sao luis","cantanhede","pirapemas"]'::jsonb
  where key = 'served_cities';

update settings set value = '["bacabeira","santa rita","entroncamento","colombo","miranda","matoes"]'::jsonb
  where key = 'intermediate_cities';
