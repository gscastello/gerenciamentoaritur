-- 135-palmeiral-e-povoado-sozinho.sql — issue #512
--
-- Palmeiral e Povoado Sozinho (entre Cantanhede e Matões do Norte; dono, 24/11): embarque e desembarque
-- válidos, como o Campestre. Aqui entram como local de desembarque nos dois sentidos, sem revisão; o
-- reconhecimento no texto e o ponto (Cantanhede na Volta) ficam em povoadoDoCaminho (grafia.ts).

insert into public.dropoff_areas (direction, code, label, detail_label, detail_placeholder, detail_required, sort_order, needs_review)
select d.direction, v.code, v.label, v.detail_label, 'Rua / ponto de referência', false, v.ordem, false
  from (values ('ida'), ('volta')) d(direction)
 cross join (values ('palmeiral', 'Palmeiral', 'Onde em Palmeiral', 52),
                    ('povoado_sozinho', 'Povoado Sozinho', 'Onde no Povoado Sozinho', 54)) v(code, label, detail_label, ordem)
 where not exists (select 1 from public.dropoff_areas a
                    where a.direction = d.direction and a.code = v.code and a.deleted_at is null);
