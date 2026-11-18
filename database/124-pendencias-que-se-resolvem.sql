-- 124-pendencias-que-se-resolvem.sql — issue #467
--
-- Pendência que já foi resolvida no app ficava aberta: a equipe lançava a reserva à mão, corrigia
-- o cadastro ou a viagem passava, e a fila continuava cheia (o dono, 18/11). Agora, de 10 em 10
-- minutos, fn_fechar_pendencias_resolvidas() confere cada pendência aberta contra o que está no app
-- e fecha a que não tem mais o que fazer, dizendo o porquê em meta.resolvida_por:
--
--   Agendado ☑️ (não lançou / lançou só parte)
--     · reserva do mesmo passageiro lançada depois da pendência ............ 'reserva_lancada'
--     · mais de 3 dias (a viagem já passou) .................................. 'vencida'
--   Pedido sem reserva (sentinela)
--     · reserva ativa para cada dia e sentido pedidos ........................ 'reserva_lancada'
--     · o último dia pedido já passou ........................................ 'viagem_passou'
--   Revisão: conferir reserva
--     · o revisor conferiu o passageiro de novo depois e não achou nada ...... 'revisor_conferiu'
--     · outra pendência do revisor mais nova para o mesmo passageiro ......... 'substituida'
--     · o passageiro não tem mais viagem futura ativa ........................ 'sem_viagem_futura'
--   Diagnóstico (Cliente sem telefone, Quantidade fora de sincronia, …)
--     · o problema não aparece mais em fn_reservation_diagnostics_findings() .. 'diagnostico_ok'
--     · repetida (mesmo problema, mesma reserva, outra mais nova aberta) ...... 'repetida'
--
-- Nada é apagado: a pendência fica no histórico como resolvida, com o motivo.

create or replace function public.fn_fechar_pendencias_resolvidas()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_out jsonb := '{}'::jsonb;
  v_n int;
begin
  -- telefone do passageiro de cada pendência aberta (o da pendência ou o da conversa)
  drop table if exists _pend;
  create temp table _pend on commit drop as
    select t.id, t.subject, t.created_at, t.meta, t.customer_id,
           coalesce(nullif(t.phone, ''), w.phone) as fone
      from support_tickets t
      left join whatsapp_conversations w on w.id::text = t.meta->>'conversation_id'
     where t.status = 'aberta';

  -- Agendado: reserva do passageiro lançada depois
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'reserva_lancada')
    from _pend p
   where s.id = p.id and p.subject like 'Agendado ☑️%' and p.fone is not null
     and exists (select 1 from reservations r join customers c on c.id = r.customer_id
                  where r.deleted_at is null and r.status <> 'cancelada'
                    and r.created_at > p.created_at
                    and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(p.fone)));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('agendado_reserva_lancada', v_n);

  -- Agendado: mais de 3 dias (a viagem já passou)
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'vencida')
    from _pend p
   where s.id = p.id and s.status = 'aberta' and p.subject like 'Agendado ☑️%' and p.created_at < now() - interval '3 days';
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('agendado_vencida', v_n);

  -- Pedido sem reserva: reserva ativa para cada dia e sentido pedidos
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'reserva_lancada')
    from _pend p
   where s.id = p.id and p.subject = 'Pedido sem reserva' and p.fone is not null
     and jsonb_array_length(coalesce(p.meta->'pedidos', '[]'::jsonb)) > 0
     and not exists (
       select 1 from jsonb_array_elements(p.meta->'pedidos') x
        where not exists (
          select 1 from reservations r join trips t on t.id = r.trip_id join customers c on c.id = r.customer_id
           where r.deleted_at is null and r.status <> 'cancelada'
             and t.trip_date = (x->>'data')::date and t.direction::text = x->>'direcao'
             and fn_normalizar_telefone(c.phone) = any(fn_variantes_telefone(p.fone))));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('pedido_reserva_lancada', v_n);

  -- Pedido sem reserva: o último dia pedido já passou
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'viagem_passou')
    from _pend p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Pedido sem reserva'
     and coalesce((select max((x->>'data')::date) from jsonb_array_elements(coalesce(p.meta->'pedidos', '[]'::jsonb)) x),
                  (p.created_at at time zone 'America/Fortaleza')::date) < v_hoje;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('pedido_viagem_passou', v_n);

  -- Revisão: o revisor conferiu de novo depois e não achou nada
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'revisor_conferiu')
    from _pend p
   where s.id = p.id and p.subject = 'Revisão: conferir reserva'
     and exists (select 1 from revisoes_reservas r
                  where r.customer_id::text = p.meta->>'revisao_cliente'
                    and r.revisado_em > p.created_at + interval '1 minute'
                    and r.resultado in ('ok', 'corrigida'));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('revisao_conferida', v_n);

  -- Revisão: há outra mais nova para o mesmo passageiro
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'substituida')
    from _pend p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Revisão: conferir reserva'
     and exists (select 1 from support_tickets o
                  where o.status = 'aberta' and o.subject = 'Revisão: conferir reserva' and o.id <> p.id
                    and o.meta->>'revisao_cliente' = p.meta->>'revisao_cliente' and o.created_at > p.created_at);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('revisao_substituida', v_n);

  -- Revisão: sem viagem futura ativa
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'sem_viagem_futura')
    from _pend p
   where s.id = p.id and s.status = 'aberta' and p.subject = 'Revisão: conferir reserva'
     and not exists (select 1 from reservations r join trips t on t.id = r.trip_id
                      where r.customer_id::text = p.meta->>'revisao_cliente' and r.deleted_at is null
                        and r.status in ('confirmada', 'pendente') and t.trip_date >= v_hoje);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('revisao_sem_viagem', v_n);

  -- Diagnóstico: o problema não aparece mais
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'diagnostico_ok')
    from _pend p
   where s.id = p.id and p.meta ? 'kind' and p.meta->>'template_key' = 'alerta_diagnostico_reserva'
     and not exists (select 1 from fn_reservation_diagnostics_findings() f
                      where f.kind = p.meta->>'kind'
                        and (f.reservation_id::text = p.meta->>'reservation_id'
                             or (p.meta->>'reservation_id' is null and f.trip_id::text = p.meta->>'trip_id')));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('diagnostico_ok', v_n);

  -- Diagnóstico repetido: fica só a mais nova
  update support_tickets s set status = 'resolvida', resolved_at = now(),
         meta = coalesce(s.meta, '{}'::jsonb) || jsonb_build_object('resolvida_por', 'repetida')
    from _pend p
   where s.id = p.id and s.status = 'aberta' and p.meta ? 'kind' and p.meta->>'template_key' = 'alerta_diagnostico_reserva'
     and exists (select 1 from support_tickets o
                  where o.status = 'aberta' and o.id <> p.id and o.created_at > p.created_at
                    and o.meta->>'kind' = p.meta->>'kind'
                    and coalesce(o.meta->>'reservation_id', o.meta->>'trip_id') = coalesce(p.meta->>'reservation_id', p.meta->>'trip_id'));
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('diagnostico_repetido', v_n);

  return v_out;
end;
$function$;
revoke all on function public.fn_fechar_pendencias_resolvidas() from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fechar-pendencias-resolvidas';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('fechar-pendencias-resolvidas', '*/10 * * * *', 'select public.fn_fechar_pendencias_resolvidas();');
end $$;
