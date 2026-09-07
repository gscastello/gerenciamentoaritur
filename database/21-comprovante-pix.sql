-- =====================================================================
-- ROTA PIRAPEMAS — 21: WEBHOOK DE COMPROVANTE PIX (issue #8)
-- =====================================================================
-- Quando o cliente escolhe Pix, o bot orienta o envio do comprovante pelo
-- WhatsApp (já fazia isso). Esta migração dá o lugar para GUARDAR a mídia
-- recebida e ligá-la à reserva, para conferência manual — SEM baixa
-- automática (o status 'pago' continua sendo decisão do papel financeiro
-- no painel).
--
-- Fluxo (backend em supabase/functions/):
--   webhook recebe m.image/m.document -> whatsappService.receivePaymentProof
--   -> baixa a mídia da Graph API -> sobe no bucket 'payment-proofs'
--   -> payments.proof_url = caminho, proof_received = true (nunca 'pago').
--
-- Rodar depois de 01-20.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Colunas de rastreio do comprovante em `payments`
--    (proof_url e proof_received já existem no 01-schema.sql)
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists proof_wa_media_id text,
  add column if not exists proof_received_at timestamptz;

-- ---------------------------------------------------------------------
-- 2) Bucket privado para os comprovantes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3) RLS do storage — só admin/financeiro leem (para gerar signed URL no
--    painel). A escrita é do edge function, que usa service_role e ignora
--    RLS; nenhuma policy de INSERT/UPDATE para authenticated/anon.
-- ---------------------------------------------------------------------
drop policy if exists "payment_proofs_read_admin_fin" on storage.objects;
create policy "payment_proofs_read_admin_fin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.fn_has_role(array['admin', 'financeiro']::public.user_role[])
  );

-- ---------------------------------------------------------------------
-- 4) v_contas_a_receber expõe o estado do comprovante para o painel
--    (drop+create: colunas novas entram no fim, mas o replace não deixa
--    inserir coluna no meio de uma view existente)
-- ---------------------------------------------------------------------
drop view if exists public.v_contas_a_receber;
create view public.v_contas_a_receber with (security_invoker = on) as
select
  r.id                as reservation_id,
  c.id                as customer_id,
  c.name              as nome,
  c.phone             as telefone,
  r.total_price       as valor_devido,
  t.trip_date         as vencimento,
  p.id                as payment_id,
  coalesce(p.status, 'pendente') as status_pagamento,
  p.method            as forma_pagamento,
  r.created_at        as criado_em,
  coalesce(p.proof_received, false) as comprovante_recebido,
  p.proof_url         as comprovante_path,
  p.proof_received_at as comprovante_em
from reservations r
join customers c on c.id = r.customer_id
left join trips t on t.id = r.trip_id
left join payments p on p.reservation_id = r.id and p.deleted_at is null
where r.type = 'passagem'
  and r.status in ('confirmada', 'embarcado')
  and r.deleted_at is null
  and (p.status is null or p.status = 'pendente');

revoke all    on public.v_contas_a_receber from anon;
grant  select on public.v_contas_a_receber to authenticated;

-- Conferir:
--   select id, public from storage.buckets where id = 'payment-proofs';
--   select reservation_id, comprovante_recebido, comprovante_path from v_contas_a_receber;
