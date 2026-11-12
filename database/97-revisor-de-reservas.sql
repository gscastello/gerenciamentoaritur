-- =====================================================================
-- ROTA PIRAPEMAS — 97: REVISOR DE RESERVAS (#339)
-- =====================================================================
-- Rodar depois de 01–96. Idempotente.
-- Pedido do dono (12/11): uma camada a mais de segurança — o bot revisa TODAS as
-- reservas futuras contra as conversas do WhatsApp até a viagem e corrige o que estiver
-- errado (dele, do cliente ou da equipe), com rastro auditável.
--   - revisoes_reservas: cada revisão de um passageiro (achados, o que foi aplicado,
--     custo). A assinatura (reservas futuras + última mensagem) diz se algo mudou desde
--     a última revisão: sem mudança, não revisa de novo.
--   - fn_clientes_para_revisar: quem precisa de revisão agora (mais perto da viagem
--     primeiro); reserva criada há menos de 3 min espera o Agendado terminar.
--   - Rotina a cada 15 min: pg_cron → pg_net → Edge Function revisor-reservas. A chave
--     da rotina é gerada aqui e fica no Vault; na tabela só o hash.
-- =====================================================================

create table if not exists public.revisoes_reservas (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  assinatura text not null,
  revisado_em timestamptz not null default now(),
  resultado text not null check (resultado in ('ok', 'corrigida', 'pendencia', 'erro')),
  achados jsonb not null default '[]'::jsonb,
  aplicados jsonb not null default '[]'::jsonb,
  observacoes text,
  modelo text,
  custo numeric(10, 5) not null default 0,
  erro text
);
create index if not exists idx_revisoes_reservas_cliente on public.revisoes_reservas (customer_id, revisado_em desc);
create index if not exists idx_revisoes_reservas_mes on public.revisoes_reservas (revisado_em);
alter table public.revisoes_reservas enable row level security;
drop policy if exists revisoes_reservas_select on public.revisoes_reservas;
create policy revisoes_reservas_select on public.revisoes_reservas
  for select using ((select fn_has_role(array['admin', 'atendente']::user_role[])));

-- assinatura do que o revisor olha: as reservas futuras do passageiro + a última mensagem
create or replace function public.fn_assinatura_revisao(p_customer_id uuid)
returns text language sql stable security definer set search_path = public as $$
  with res as (
    select string_agg(concat_ws('|', r.id, r.status, r.trip_id, r.route_point_id, r.pickup_neighborhood, r.pickup_detail,
                                r.street, r.reference_point, r.dropoff_location, r.dropoff_area, r.quantity, r.unit_price, r.type),
                      ',' order by r.id) s
    from reservations r join trips t on t.id = r.trip_id
    where r.customer_id = p_customer_id and r.deleted_at is null and r.status in ('confirmada', 'pendente')
      and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
  ),
  msg as (
    select max(o.created_at) ultima
    from bot_observations o
    join whatsapp_conversations w on w.id = o.conversation_id
    join customers c on c.id = p_customer_id
    where w.deleted_at is null and o.author in ('cliente', 'equipe')
      and fn_normalizar_telefone(w.phone) = any(fn_variantes_telefone(c.phone))
  )
  select md5(coalesce((select s from res), '') || '#' || coalesce((select ultima::text from msg), ''))
$$;
revoke all on function public.fn_assinatura_revisao(uuid) from public, anon, authenticated;
grant execute on function public.fn_assinatura_revisao(uuid) to service_role;

create or replace function public.fn_clientes_para_revisar(p_limite integer default 6)
returns table (customer_id uuid, assinatura text, proxima date)
language sql stable security definer set search_path = public as $$
  with futuras as (
    select r.customer_id, min(t.trip_date) proxima, max(r.created_at) ultima_criada
    from reservations r join trips t on t.id = r.trip_id
    where r.deleted_at is null and r.status in ('confirmada', 'pendente') and r.customer_id is not null
      and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
    group by r.customer_id
  ),
  com_assinatura as (
    select f.customer_id, f.proxima, f.ultima_criada, fn_assinatura_revisao(f.customer_id) assinatura from futuras f
  )
  select a.customer_id, a.assinatura, a.proxima
  from com_assinatura a
  where a.ultima_criada < now() - interval '3 minutes'
    -- já revisado com essa mesma assinatura: nada mudou
    and not exists (select 1 from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura and v.resultado <> 'erro')
    -- falhou 2 vezes com a mesma assinatura: não insiste (a equipe vê o erro)
    and (select count(*) from revisoes_reservas v where v.customer_id = a.customer_id and v.assinatura = a.assinatura and v.resultado = 'erro') < 2
  order by a.proxima, a.ultima_criada
  limit greatest(1, least(coalesce(p_limite, 6), 30))
$$;
revoke all on function public.fn_clientes_para_revisar(integer) from public, anon, authenticated;
grant execute on function public.fn_clientes_para_revisar(integer) to service_role;

-- ---------------------------------------------------------------------
-- Chave da rotina (pg_cron → Edge Function): gerada aqui, guardada no Vault; só o hash na tabela
-- ---------------------------------------------------------------------
create table if not exists public.rotinas_chaves (
  nome text primary key,
  hash text not null,
  created_at timestamptz not null default now()
);
alter table public.rotinas_chaves enable row level security; -- sem política: só o servidor

do $$
declare v_token text;
begin
  if not exists (select 1 from public.rotinas_chaves where nome = 'revisor') then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    perform vault.create_secret(v_token, 'rotina_revisor_token', 'chave da rotina do revisor de reservas (#339)');
    insert into public.rotinas_chaves (nome, hash) values ('revisor', encode(extensions.digest(v_token, 'sha256'), 'hex'));
  end if;
end $$;

create or replace function public.fn_rotina_autorizada(p_nome text, p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rotinas_chaves
    where nome = p_nome and hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  )
$$;
revoke all on function public.fn_rotina_autorizada(text, text) from public, anon, authenticated;
grant execute on function public.fn_rotina_autorizada(text, text) to service_role;

do $$
begin
  perform cron.unschedule('revisar-reservas') where exists (select 1 from cron.job where jobname = 'revisar-reservas');
  perform cron.schedule(
    'revisar-reservas',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://szwnsacgpsvioswrelqo.supabase.co/functions/v1/revisor-reservas',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rotina_revisor_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $job$
  );
end $$;

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------
do $$
begin
  if fn_rotina_autorizada('revisor', 'chave errada') then raise exception 'chave errada passou'; end if;
  if not exists (select 1 from cron.job where jobname = 'revisar-reservas') then raise exception 'rotina do revisor não agendada'; end if;
  if fn_assinatura_revisao(gen_random_uuid()) is null then raise exception 'assinatura nula'; end if;
end $$;
