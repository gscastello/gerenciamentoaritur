-- =====================================================================
-- ROTA PIRAPEMAS — 105: FECHAMENTO DO MÊS PARA O CONTADOR (#365)
-- =====================================================================
-- Rodar depois de 01–104 (usa rpc_numeros_do_financeiro, database/102).
-- Idempotente.
-- O pacote do mês: resultado (DRE), receitas por sentido, viagem e forma de
-- pagamento, despesas por categoria, todos os lançamentos com a foto da nota
-- (quando foi lançado pela foto, database/99), pagamentos e contas quitadas.
-- A tela Gestão → Fechamento monta o PDF, a planilha e o .zip das fotos com
-- isto, e soma a estimativa do DAS (domain/simplesNacional.js).
-- Todo dia 1, às 08:00 de São Luís, o sino avisa que o mês anterior fechou.
-- Só admin e financeiro.
-- =====================================================================

create or replace function public.rpc_fechamento_do_mes(p_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_de date;
  v_ate date;
begin
  if not (select fn_has_role(array['admin', 'financeiro']::user_role[])) then
    raise exception 'O fechamento do mês é só para admin/financeiro.' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido (AAAA-MM).' using errcode = '22023';
  end if;
  v_de := (p_mes || '-01')::date;
  v_ate := (v_de + interval '1 month' - interval '1 day')::date;

  return jsonb_build_object(
    'mes', p_mes,
    'de', v_de,
    'ate', v_ate,
    'gerado_em', now(),
    'numeros', rpc_numeros_do_financeiro(v_de, v_ate),
    'lancamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', fe.id, 'data', fe.entry_date, 'tipo', fe.type, 'categoria', fe.category,
               'valor', fe.amount, 'descricao', fe.description, 'nota', n.arquivo)
             order by fe.entry_date, fe.type desc, fe.created_at)
        from financial_entries fe
        left join lateral (
          select d.arquivo from documentos_lidos d
           where d.status = 'lancado'
             and (d.financial_entry_id = fe.id
                  or (fe.fuel_record_id is not null and d.fuel_record_id = fe.fuel_record_id)
                  or (fe.maintenance_id is not null and d.maintenance_id = fe.maintenance_id))
           order by d.created_at desc limit 1) n on true
       where fe.deleted_at is null and fe.entry_date between v_de and v_ate), '[]'),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', (p.paid_at at time zone 'America/Fortaleza')::date, 'forma', p.method,
               'valor', p.amount, 'viagem', t.trip_date, 'sentido', t.direction)
             order by p.paid_at)
        from payments p
        join reservations r on r.id = p.reservation_id
        left join trips t on t.id = r.trip_id
       where p.deleted_at is null and p.status = 'pago'
         and (p.paid_at at time zone 'America/Fortaleza')::date between v_de and v_ate), '[]'),
    'contas_quitadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titulo', v.titulo, 'categoria', v.categoria, 'valor', v.valor,
               'vence_em', v.vence_em, 'quitado_em', v.quitado_em)
             order by v.quitado_em)
        from vencimentos v
       where v.deleted_at is null and v.quitado_em between v_de and v_ate), '[]')
  );
end $$;

revoke all on function public.rpc_fechamento_do_mes(text) from public, anon;
grant execute on function public.rpc_fechamento_do_mes(text) to authenticated;

-- Aviso no sino: o mês anterior fechou (um por mês).
create or replace function public.fn_avisar_fechamento()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes text := to_char(((now() at time zone 'America/Fortaleza')::date - interval '1 month'), 'YYYY-MM');
  v_nome text;
begin
  if exists (select 1 from app_notifications where kind = 'fechamento' and meta ->> 'mes' = v_mes) then
    return;
  end if;
  v_nome := (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
                   'setembro', 'outubro', 'novembro', 'dezembro'])[substr(v_mes, 6, 2)::int]
            || ' de ' || substr(v_mes, 1, 4);
  insert into app_notifications (kind, title, body, meta)
  values ('fechamento', 'Fechamento de ' || v_nome || ' pronto',
          'O pacote para o contador está em Gestão → Fechamento: resultado, receitas, despesas, notas e a estimativa do DAS. Baixe em PDF, planilha e as fotos das notas.',
          jsonb_build_object('mes', v_mes));
end $$;

revoke all on function public.fn_avisar_fechamento() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('avisar-fechamento-do-mes')
    where exists (select 1 from cron.job where jobname = 'avisar-fechamento-do-mes');
  perform cron.schedule('avisar-fechamento-do-mes', '0 11 1 * *', 'select public.fn_avisar_fechamento();');
end $$;

-- Aviso com números da empresa (vencimento, fechamento): só admin e financeiro veem.
drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select on public.app_notifications for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente', 'motorista', 'financeiro']::user_role[]))
         and (kind not in ('vencimento', 'fechamento')
              or (select fn_has_role(array['admin', 'financeiro']::user_role[]))));
