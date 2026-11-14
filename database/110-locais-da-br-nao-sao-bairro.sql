-- 110 — Trechos da BR não são bairro de busca em casa (issue #418)
--
-- A empresa não busca passageiro em casa nos trechos da extensão da BR (Estiva, Pedrinhas,
-- Oleama, Maracanã, Vila Itamar…): o cliente espera na BR e a van para. Esses lugares já estão em
-- "Locais em Outros" (boarding_spot_prices, R$ 60), mas a importação de bairros (#330) também os
-- trouxe para a tabela de bairros, SEM preço — e o bot lançou "busca em casa · Estiva" com R$ 0.
--   - Maracanã entra nos Locais em Outros (R$ 60, igual aos outros trechos da BR);
--   - os locais de Outros saem da tabela de bairros, só se estiverem sem preço (nunca apaga um
--     bairro com preço que o dono preencheu). As reservas guardam o texto e não mudam.

insert into public.boarding_spot_prices (local, price)
select 'Maracanã', 60
 where not exists (select 1 from public.boarding_spot_prices where fn_normalizar_local(local) = fn_normalizar_local('Maracanã'));

delete from public.neighborhood_pricing n
 where n.price is null
   and fn_normalizar_local(n.neighborhood) in (select fn_normalizar_local(b.local) from public.boarding_spot_prices b);
