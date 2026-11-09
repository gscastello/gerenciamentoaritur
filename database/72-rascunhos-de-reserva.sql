-- =====================================================================
-- ROTA PIRAPEMAS — 72: RESERVAS PREPARADAS PELA IA (#254)
-- =====================================================================
-- Rodar depois de 01–71. Idempotente.
-- O bot lê as conversas do WhatsApp (em qualquer modo) e, quando o cliente já
-- mandou o que basta (data da viagem + endereço ou ponto), grava aqui um
-- RASCUNHO. A equipe vê na aba Atendimento ("Reservas prontas para lançar") e,
-- com um toque, abre a nova reserva já preenchida. Nada é reservado aqui:
-- preço e vaga continuam saindo da tabela do sistema e de rpc_create_reservation.
--
-- Ciclo do rascunho: pronta → lancada (quando a reserva do cliente naquela
-- viagem é criada, por qualquer caminho — gatilho abaixo) ou descartada (a
-- equipe dispensou). Um rascunho aberto por conversa, data e sentido.
-- =====================================================================

create table if not exists public.reservation_drafts (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         uuid references public.whatsapp_conversations(id),
  chatwoot_conversation_id bigint,
  customer_id             uuid references public.customers(id),
  phone                   text,                 -- normalizado (fn_normalizar_telefone)
  customer_name           text,                 -- do cadastro ou o que o CLIENTE escreveu (nunca o perfil)
  type                    reservation_type not null default 'passagem',
  trip_date               date not null,
  direction               trip_direction not null,
  route_point_code        text,
  pickup_neighborhood     text,
  pickup_detail           text,                 -- rua, número, referência ou detalhe do ponto
  dropoff_location        text,
  dropoff_area            text,
  quantity                integer not null default 1 check (quantity between 1 and 31),
  client_excerpt          text,                 -- trecho do que o cliente escreveu (para conferir)
  notes                   text,                 -- dúvida que a IA deixou para a equipe
  source_message_id       bigint,               -- última mensagem do cliente lida
  status                  text not null default 'pronta'
                            check (status in ('pronta', 'lancada', 'descartada')),
  reservation_id          uuid references public.reservations(id),
  resolved_by             uuid references public.users(id),
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists uq_reservation_drafts_aberto
  on public.reservation_drafts (conversation_id, trip_date, direction)
  where status = 'pronta';

create index if not exists idx_reservation_drafts_prontas
  on public.reservation_drafts (trip_date)
  where status = 'pronta';

drop trigger if exists trg_reservation_drafts_updated_at on public.reservation_drafts;
create trigger trg_reservation_drafts_updated_at
  before update on public.reservation_drafts
  for each row execute function fn_set_updated_at();

alter table public.reservation_drafts enable row level security;

drop policy if exists reservation_drafts_select on public.reservation_drafts;
create policy reservation_drafts_select on public.reservation_drafts
  for select using (fn_has_role(array['admin', 'atendente']::user_role[]));

-- escrita: o bot pelo service_role; a equipe só descarta (RPC abaixo)
grant select on public.reservation_drafts to authenticated;

-- ---------------------------------------------------------------------
-- A equipe dispensa um rascunho (não era pedido, já resolvido por fora…).
-- ---------------------------------------------------------------------
create or replace function public.rpc_descartar_rascunho_de_reserva(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update reservation_drafts
     set status = 'descartada', resolved_by = auth.uid(), resolved_at = now()
   where id = p_draft_id and status = 'pronta';
  if not found then
    return jsonb_build_object('success', false, 'message', 'Rascunho não encontrado ou já resolvido.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.rpc_descartar_rascunho_de_reserva(uuid) from public, anon;
grant execute on function public.rpc_descartar_rascunho_de_reserva(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Reserva criada para o cliente naquela viagem (pelo app, pela anotação, pelo
-- bot ou pelo Claude) → o rascunho correspondente sai da lista.
-- ---------------------------------------------------------------------
create or replace function public.fn_fechar_rascunho_ao_reservar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_data   date;
  v_dir    trip_direction;
  v_fone   text;
begin
  if new.trip_id is null or new.deleted_at is not null or new.status = 'cancelada' then
    return new;
  end if;
  select t.trip_date, t.direction into v_data, v_dir from trips t where t.id = new.trip_id;
  select c.phone into v_fone from customers c where c.id = new.customer_id;

  update reservation_drafts d
     set status = 'lancada', reservation_id = new.id,
         resolved_by = coalesce(auth.uid(), new.created_by), resolved_at = now()
   where d.status = 'pronta'
     and d.trip_date = v_data
     and d.direction = v_dir
     and (d.customer_id = new.customer_id
          or (v_fone is not null and d.phone = any(fn_variantes_telefone(v_fone))));
  return new;
exception when others then
  -- rascunho é conveniência: nunca pode impedir uma reserva
  return new;
end;
$$;

drop trigger if exists trg_reservations_fecha_rascunho on public.reservations;
create trigger trg_reservations_fecha_rascunho
  after insert on public.reservations
  for each row execute function fn_fechar_rascunho_ao_reservar();

-- tempo real: a lista da aba Atendimento atualiza sozinha entre os sócios
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservation_drafts'
  ) then
    execute 'alter publication supabase_realtime add table public.reservation_drafts';
  end if;
end $$;
