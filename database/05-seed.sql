-- =====================================================================
-- ROTA PIRAPEMAS — SEED INICIAL
-- Reproduz fielmente os dados padrão que hoje estão hardcoded no
-- frontend (TRIPS_PADRAO, BAIRROS_80/90, DEFAULT_OPERACAO) — a diferença
-- é que agora vivem no banco e são editáveis via painel/admin, não mais
-- fixos no código.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Veículos
-- ---------------------------------------------------------------------
insert into vehicles (id, name, plate, type, capacity, is_default, active) values
  ('11111111-1111-1111-1111-111111111111', 'Ônibus principal', 'PIR-2A10', 'onibus', 31, true,  true),
  ('22222222-2222-2222-2222-222222222222', 'Van reserva',      'PIR-7B44', 'van',    14, false, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Motorista titular (sem login próprio por padrão — user_id fica null
-- até vincularem um convite do Supabase Auth a este motorista)
-- ---------------------------------------------------------------------
insert into drivers (id, name, phone, active) values
  ('33333333-3333-3333-3333-333333333333', 'Motorista titular', null, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Pontos de embarque/desembarque — Ida
-- ---------------------------------------------------------------------
insert into route_points (direction, code, name, base_time, price, requires_detail, detail_label, is_core, display_order) values
  ('ida', 'busca',       'Buscar em Casa',           '05:00', null, true,  'Bairro',                                true, 1),
  ('ida', 'rodoviaria',  'Rodoviária',                '05:40', 60,   false, null,                                    true, 2),
  ('ida', 'retorno',     'Retorno das Vans',          '05:50', 60,   false, null,                                    true, 3),
  ('ida', 'postocarone', 'Posto Carone',              '05:55', 60,   false, null,                                    true, 4),
  ('ida', 'br',          'BR',                         '06:00', 60,   true,  'Local exato na BR (km, referência)',   true, 5),
  ('ida', 'outro',       'Outro local de embarque',   '05:40', 60,   true,  'Descreva o local de embarque',         true, 6)
on conflict (direction, code) where deleted_at is null do nothing;

-- ---------------------------------------------------------------------
-- Pontos de embarque — Volta (com janela de busca porta-a-porta)
-- ---------------------------------------------------------------------
insert into route_points (direction, code, name, base_time, price, is_core, display_order, boarding_window) values
  ('volta', 'pirapemas',  'Pirapemas',  '12:00', 60, true, 1, '12:00 – 13:00'),
  ('volta', 'cantanhede', 'Cantanhede', '13:00', 60, true, 2, '13:00 – 14:00')
on conflict (direction, code) where deleted_at is null do nothing;

-- ---------------------------------------------------------------------
-- Precificação por bairro — "Buscar em Casa" (R$80)
-- ---------------------------------------------------------------------
insert into neighborhood_pricing (neighborhood, price)
select unnest(array[
  'Centro','Apicum','Camboa','Madre Deus','Lira','Vila Passos','Diamante','Coréia','Goiabal','Areinha',
  'Fabril','Monte Castelo','Alemanha','Apeadouro','Belira','Barreto','Fátima','Bairro de Fátima','Liberdade',
  'João Paulo','Caratatiua','Sacavém','Outeiro da Cruz','Jordoa','Filipinho','Coroado','Vila Ivar Saldanha',
  'Vila Palmeira','Anil','Cruzeiro do Anil','Aurora','Parque Aurora','Sítio Leal','Redenção','Ipase',
  'Maranhão Novo','Rio Anil','Cohab Anil I','Cohab Anil II','Cohab Anil III','Cohab Anil IV','Bequimão',
  'Angelim','Cohafuma','Cohama','Vinhais','Recanto dos Vinhais','Planalto Vinhais I','Planalto Vinhais II',
  'Turu','Planalto Turu','Planalto Turu II','Planalto Turu III','Jardim Atlântico','Recanto do Turu',
  'Vivendas do Turu','Chácara Brasil','Parque Shalon','Parque Athenas','Parque Atlântico','Parque Universitário',
  'Parque Timbiras','Parque dos Nobres','Parque Pindorama','Parque Amazonas','Parque Vitória','Planalto Anil',
  'Planalto Aurora','Cohatrac I','Cohatrac II','Cohatrac III','Cohatrac IV','Cohatrac V','Forquilha',
  'Pão de Açúcar','Jardim América','Jardim Alvorada','Jardim São Cristóvão','IPEM São Cristóvão','São Bernardo',
  'São Cristóvão','Tirirical','João de Deus','Vila Janaína','Cidade Operária','Cidade Olímpica','Santa Efigênia',
  'Santa Clara','Santa Bárbara','Vila Isabel Cafeteira','Vila Brasil','Vila Cascavel','Vila Apaco','Vila América',
  'Novo Angelim','Jardim das Margaridas','Parque dos Sabiás','Recanto dos Nobres','Recanto dos Pássaros',
  'Recanto dos Signos'
]::text[]) as neighborhood, 80
on conflict (neighborhood) do nothing;

-- ---------------------------------------------------------------------
-- Precificação por bairro — "Buscar em Casa" (R$90)
-- ---------------------------------------------------------------------
insert into neighborhood_pricing (neighborhood, price)
select unnest(array[
  'Sol e Mar','Vila Luizão','Divinéia','Alto do Turu','Ipem Turu','Anjo da Guarda','Alto da Esperança',
  'Bonfim','Cajueiro','Cidade Nova','Fumacê','Gancharia','Gapara','Itaqui','Jambeiro','Mauro Fecury I',
  'Mauro Fecury II','Piancó','Porto Grande','Sá Viana','São Raimundo','Tamancão','Vila Ariri','Vila Bacanga',
  'Vila Collier','Vila Embratel','Vila Isabel','Vila Maranhão','Vila Nova','Vila São Luís','Vila Tiradentes'
]::text[]) as neighborhood, 90
on conflict (neighborhood) do nothing;

-- ---------------------------------------------------------------------
-- Configurações gerais (settings) — equivalentes ao DEFAULT_CONFIG/
-- DEFAULT_OPERACAO do frontend
-- ---------------------------------------------------------------------
insert into settings (key, value) values
  ('monday_adjustment', '{"active": true, "hours": 1}'::jsonb),
  ('attendance_mode',   '{"mode": "ia"}'::jsonb),
  ('pix',               '{"key": "98981012388", "name": "A O Castelo Transporte e Turismo"}'::jsonb),
  ('intermediate_cities', '["bacabeira","santa rita","entroncamento","colombo","miranda","matões","matoes"]'::jsonb),
  ('served_cities',     '["são luís","sao luis","cantanhede","pirapemas"]'::jsonb),
  ('sync_poll_seconds', '{"value": 8}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Usuário de sistema para atribuir ações feitas pelo bot do WhatsApp
-- (crie o auth.users correspondente no Supabase Auth com este UUID antes
-- de rodar esta linha, ou ajuste o id para o gerado pelo Auth)
-- ---------------------------------------------------------------------
-- insert into users (id, name, role) values
--   ('00000000-0000-0000-0000-000000000001', 'Bot WhatsApp', 'atendente')
-- on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Viagens do dia (exemplo — normalmente geradas por um job diário/cron
-- que cria as linhas de "trips" para os próximos N dias a partir de
-- route_points + settings.monday_adjustment; ver seção 6 do DATABASE.md)
-- ---------------------------------------------------------------------
insert into trips (trip_date, direction, vehicle_id, driver_id, capacity, monday_adjusted, status)
values
  (current_date, 'ida',   '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 31,
     extract(dow from current_date) = 1, 'agendada'),
  (current_date, 'volta', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 31,
     false, 'agendada')
on conflict (trip_date, direction) where deleted_at is null do nothing;
