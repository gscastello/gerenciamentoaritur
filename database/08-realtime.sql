-- =====================================================================
-- ROTA PIRAPEMAS — 08: REALTIME (atualização ao vivo entre atendentes)
-- =====================================================================
-- O frontend usa `useRealtimeTable` (Supabase Realtime) para que a tela
-- de um atendente atualize sozinha quando outro atendente muda algo.
-- Para isso, as tabelas precisam estar na publicação `supabase_realtime`.
-- Rodar depois de 01-05 (as tabelas de negócio) e, se já rodou o 06,
-- inclui também as do WhatsApp.
--
-- Só READ é transmitido — o RLS de cada tabela continua valendo: cada
-- atendente só recebe eventos das linhas que ele já poderia ler.

do $$
declare
  t text;
  wanted text[] := array[
    'reservations', 'reservation_passengers', 'trips', 'payments',
    'customers', 'financial_entries', 'fuel_records', 'maintenance',
    'operational_occurrences', 'route_points', 'vehicles', 'drivers', 'settings'
  ];
begin
  -- adiciona as do WhatsApp se as tabelas existirem (06-whatsapp.sql já rodado)
  if to_regclass('public.whatsapp_conversations') is not null then
    wanted := wanted || array['whatsapp_conversations', 'whatsapp_messages'];
  end if;

  foreach t in array wanted loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Conferir o que está publicado:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
