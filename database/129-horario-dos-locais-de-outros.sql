-- 129-horario-dos-locais-de-outros.sql — issue #486
--
-- DESFEITA pela database/130 no mesmo dia: o dono preferiu o Posto Carone como ponto próprio.
-- Fica aqui só como histórico do que rodou no banco.
--
-- O Posto Carone sai às 4:40 na segunda, mas a mensagem depois do "Agendado ☑️" dizia 5:30: o
-- local é da categoria Outros e valia o horário de Outros (06:30, 1 h mais cedo na segunda). Agora
-- cada local de Outros pode ter o HORÁRIO próprio (dias normais), editável em Sistema → Locais em
-- Outros; na segunda a Ida continua saindo `monday_adjustment.hours` mais cedo, como os pontos.
-- Vale na confirmação do Agendado, no lembrete da viagem e no "Avisar passageiros".

alter table public.boarding_spot_prices add column if not exists horario time;

-- o local pode ter só horário (preço vazio = vale o preço de Outros)
alter table public.boarding_spot_prices alter column price drop not null;

drop function if exists public.rpc_upsert_boarding_spot_price(text, numeric);
create or replace function public.rpc_upsert_boarding_spot_price(p_local text, p_price numeric, p_horario time default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if length(btrim(coalesce(p_local, ''))) < 3 then
    return jsonb_build_object('success', false, 'message', 'Informe o local de embarque.');
  end if;
  if fn_normalizar_local(p_local) ~ '(^| )retorno( |$)' then
    return jsonb_build_object('success', false,
      'message', 'O Retorno é um ponto próprio, com o preço dele: não cadastre aqui.');
  end if;
  if p_price is not null and p_price <= 0 then
    return jsonb_build_object('success', false, 'message', 'Informe um valor maior que zero (ou deixe vazio).');
  end if;
  if p_price is null and p_horario is null then
    return jsonb_build_object('success', false, 'message', 'Informe o valor, o horário ou os dois.');
  end if;

  insert into boarding_spot_prices (local, price, horario, created_by, updated_by)
  values (btrim(p_local), p_price, p_horario, auth.uid(), auth.uid())
  on conflict (fn_normalizar_local(local)) do update
    set price = excluded.price, horario = excluded.horario, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$function$;
revoke all on function public.rpc_upsert_boarding_spot_price(text, numeric, time) from public, anon;
grant execute on function public.rpc_upsert_boarding_spot_price(text, numeric, time) to authenticated;

-- o pedido do dono (22/11): Posto Carone às 4:40 na segunda = 5:40 nos outros dias (a Ida de
-- segunda sai 1 h mais cedo); o valor fica o de Outros
insert into boarding_spot_prices (local, price, horario)
values ('Posto Carone', null, '05:40')
on conflict (fn_normalizar_local(local)) do update set horario = excluded.horario, updated_at = now();
