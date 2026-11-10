-- =====================================================================
-- ROTA PIRAPEMAS — 83: FILA DO WHATSAPP RÁPIDA (auditoria de 10/11/2026)
-- =====================================================================
-- Rodar depois de 01–82. Idempotente.
-- v_atendimento_whatsapp procurava o cliente de cada conversa chamando
-- fn_variantes_telefone(w.phone) linha a linha (a função tem search_path fixo,
-- então o Postgres não a "abre" dentro da consulta): ~0,6 ms × 1.315 conversas =
-- ~0,8 s a cada atualização da aba Atendimento. Agora as variantes do telefone
-- (com/sem 55, com/sem o nono dígito) ficam guardadas na própria conversa,
-- numa coluna calculada pelo banco. Medido: 816 ms → 14 ms, mesmo resultado.
-- =====================================================================

alter table public.whatsapp_conversations
  add column if not exists telefone_variantes text[]
  generated always as (public.fn_variantes_telefone(phone)) stored;

create index if not exists idx_wa_conversations_variantes
  on public.whatsapp_conversations using gin (telefone_variantes);

do $$
declare def text;
begin
  def := pg_get_viewdef('public.v_atendimento_whatsapp'::regclass, true);
  if position('fn_variantes_telefone(w.phone)' in def) > 0 then
    def := replace(def, 'cu.phone = ANY (fn_variantes_telefone(w.phone))', 'cu.phone = ANY (w.telefone_variantes)');
    execute 'create or replace view public.v_atendimento_whatsapp with (security_invoker = true) as ' || def;
  end if;
end $$;
