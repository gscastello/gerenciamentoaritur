-- =====================================================================
-- ROTA PIRAPEMAS — 100: BAIXA PELO COMPROVANTE PIX LIDO (#363)
-- =====================================================================
-- Rodar depois de 01–99. Idempotente.
-- O cliente manda o comprovante no WhatsApp; o bot lê (valor, data, quem
-- recebeu, id da transação) e, se bate com reserva(s) do cliente, dá baixa.
-- A conferência final é AQUI, no banco, numa transação:
--   * o mesmo comprovante (id da transação) nunca dá baixa duas vezes;
--   * a soma das reservas tem de ser exatamente o valor do comprovante;
--   * reserva cancelada, apagada ou já paga não recebe baixa.
-- Tudo fica registrado em `comprovantes_pix` (o que foi lido e o que se fez),
-- inclusive o que virou pendência para a equipe.
-- =====================================================================

create table if not exists public.comprovantes_pix (
  id            uuid primary key default gen_random_uuid(),
  txid          text,                         -- id da transação (E2E) quando aparece
  valor         numeric(10, 2),
  arquivo       text,                         -- caminho no bucket payment-proofs
  customer_id   uuid references public.customers(id),
  conversation_id uuid,
  reservas      uuid[] not null default '{}', -- as que receberam baixa
  resultado     text not null check (resultado in ('baixa', 'pendencia', 'nao_e_comprovante')),
  motivo        text,
  leitura       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create unique index if not exists uq_comprovantes_pix_txid_baixa
  on public.comprovantes_pix (txid) where txid is not null and resultado = 'baixa';
create index if not exists idx_comprovantes_pix_cliente on public.comprovantes_pix (customer_id, created_at desc);

alter table public.comprovantes_pix enable row level security;
drop policy if exists comprovantes_pix_select on public.comprovantes_pix;
create policy comprovantes_pix_select on public.comprovantes_pix for select to authenticated
  using ((select fn_has_role(array['admin', 'financeiro', 'atendente']::user_role[])));
grant select on public.comprovantes_pix to authenticated;

create or replace function public.rpc_baixa_por_comprovante(
  p_reservas uuid[],
  p_valor numeric,
  p_arquivo text,
  p_txid text,
  p_leitura jsonb,
  p_customer_id uuid,
  p_conversation_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_txid  text := nullif(btrim(coalesce(p_txid, '')), '');
  v_n     integer;
  v_soma  numeric;
  r       record;
  v_pg    uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'motivo', 'sem_permissao');
  end if;
  if p_reservas is null or cardinality(p_reservas) = 0 or p_valor is null or p_valor <= 0 then
    return jsonb_build_object('success', false, 'motivo', 'pedido_invalido');
  end if;
  if v_txid is not null and exists (select 1 from comprovantes_pix where txid = v_txid and resultado = 'baixa') then
    return jsonb_build_object('success', false, 'motivo', 'repetido');
  end if;

  select count(*), coalesce(sum(total_price), 0) into v_n, v_soma
    from (select total_price from reservations
           where id = any(p_reservas) and deleted_at is null
             and status in ('confirmada', 'pendente', 'embarcado')
           for update) x;
  if v_n <> cardinality(p_reservas) then
    return jsonb_build_object('success', false, 'motivo', 'reserva_invalida');
  end if;
  if abs(v_soma - p_valor) > 0.009 then
    return jsonb_build_object('success', false, 'motivo', 'valor_diferente', 'soma', v_soma);
  end if;
  if exists (select 1 from payments p where p.reservation_id = any(p_reservas)
              and p.deleted_at is null and p.status = 'pago') then
    return jsonb_build_object('success', false, 'motivo', 'ja_pago');
  end if;

  for r in select id, total_price from reservations where id = any(p_reservas) loop
    select id into v_pg from payments where reservation_id = r.id and deleted_at is null order by created_at limit 1;
    if v_pg is null then
      insert into payments (reservation_id, amount, method, status, created_by)
      values (r.id, r.total_price, 'pix', 'pendente', p_actor)
      returning id into v_pg;
    end if;
    update payments
       set status = 'pago', paid_at = now(), method = 'pix', amount = r.total_price,
           proof_url = coalesce(p_arquivo, proof_url), proof_received = true,
           proof_received_at = now(), updated_by = p_actor
     where id = v_pg;
    update reservations set payment_method = 'pix', updated_by = p_actor where id = r.id;
    v_pg := null;
  end loop;

  insert into comprovantes_pix (txid, valor, arquivo, customer_id, conversation_id, reservas, resultado, leitura)
  values (v_txid, p_valor, p_arquivo, p_customer_id, p_conversation_id, p_reservas, 'baixa', coalesce(p_leitura, '{}'::jsonb));

  return jsonb_build_object('success', true, 'reservas', cardinality(p_reservas));
end $$;
revoke all on function public.rpc_baixa_por_comprovante(uuid[], numeric, text, text, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_baixa_por_comprovante(uuid[], numeric, text, text, jsonb, uuid, uuid, uuid) to service_role;
