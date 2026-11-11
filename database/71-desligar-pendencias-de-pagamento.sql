-- =====================================================================
-- ROTA PIRAPEMAS — 71: desligar as pendências automáticas de pagamento (#248)
-- =====================================================================
-- As cobranças ainda são feitas à mão. Por enquanto, os dois jobs abaixo
-- deixam de abrir pendência (aba Pendências + sino):
--   - fn_enqueue_overdue_payment_alerts (cron alert-overdue-payments, diário):
--     "Pagamento pendente — <cliente>", um por passagem em aberto;
--   - achado 'pagamento_ausente' do diagnóstico de 6/6h (fn_run_reservation_
--     diagnostics): "Passagem confirmada sem nenhum pagamento registrado".
-- A tela Contas a receber continua igual.
--
-- Para religar depois, sem migração:
--   update settings set value = '{"active": true}' where key = 'payment_pending_alerts';
--
-- Rodar depois de 01-70. Idempotente.
-- =====================================================================

insert into settings (key, value)
values ('payment_pending_alerts', '{"active": false}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Chave ausente = ligado (comportamento de antes).
create or replace function public.fn_alertas_de_pagamento_ativos() returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(
    (select (value ->> 'active')::boolean from settings where key = 'payment_pending_alerts'),
    true
  );
$$;
revoke execute on function public.fn_alertas_de_pagamento_ativos() from public, anon;
grant execute on function public.fn_alertas_de_pagamento_ativos() to authenticated, service_role;

-- 1) "Pagamento pendente — <cliente>" (38-alertas-internos-para-pendencias.sql)
create or replace function fn_enqueue_overdue_payment_alerts() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.fn_alertas_de_pagamento_ativos() then
    return;
  end if;

  insert into support_tickets (source, phone, customer_id, subject, detail, meta)
  select 'sistema', c.phone, r.customer_id,
         'Pagamento pendente — ' || coalesce(c.name, 'cliente sem nome'),
         format('%s dia(s) em aberto, R$ %s a receber.',
                current_date - r.created_at::date, p.amount),
         jsonb_build_object('reservation_id', r.id, 'template_key', 'pagamento_pendente_interno')
  from reservations r
  join payments p on p.reservation_id = r.id and p.status = 'pendente' and p.deleted_at is null
  join customers c on c.id = r.customer_id
  where r.type = 'passagem' and r.status in ('confirmada', 'embarcado') and r.deleted_at is null
    and r.created_at::date <= current_date - 2
    and not exists (
        select 1 from support_tickets st
        where st.meta ->> 'reservation_id' = r.id::text
          and st.meta ->> 'template_key' = 'pagamento_pendente_interno'
          and st.created_at::date = current_date
      );
end;
$$;

-- 2) achado 'pagamento_ausente' do diagnóstico (20-diagnostico-reservas.sql):
--    troca só o trecho dele na definição que está no banco; para com erro se
--    o trecho não estiver lá (definição diferente da esperada).
do $$
declare
  v_def  text := pg_get_functiondef('public.fn_reservation_diagnostics_findings()'::regprocedure);
  v_de   text := $t$    and r.created_at < now() - interval '1 day'$t$;
  v_para text := $t$    and r.created_at < now() - interval '1 day'
    and public.fn_alertas_de_pagamento_ativos()$t$;
begin
  if position('fn_alertas_de_pagamento_ativos' in v_def) > 0 then
    return; -- já aplicado
  end if;
  if position(v_de in v_def) = 0 then
    raise exception 'fn_reservation_diagnostics_findings: trecho do pagamento_ausente não encontrado';
  end if;
  execute replace(v_def, v_de, v_para);
end;
$$;

-- 3) o que ainda estiver aberto desses dois tipos sai da aba Pendências
update support_tickets
   set status = 'resolvida', resolved_at = now()
 where status = 'aberta'
   and source = 'sistema'
   and (meta ->> 'template_key' = 'pagamento_pendente_interno'
        or (meta ->> 'template_key' = 'alerta_diagnostico_reserva' and meta ->> 'kind' = 'pagamento_ausente'));

-- Conferir:
--   select fn_alertas_de_pagamento_ativos();                                  -- false
--   select count(*) from fn_reservation_diagnostics_findings() where kind = 'pagamento_ausente';  -- 0
