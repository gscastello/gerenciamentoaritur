-- 111 — Banco de casos reais e avaliação do bot (issue #419)
--
-- Meta do dono: 99,9% de acerto (um erro faz o passageiro perder a viagem). Cada "Agendado ☑️"
-- real vira um caso: a conversa até a marca + as viagens que FICARAM depois dela (já corrigidas pela
-- equipe). A Edge Function `avaliar-bot` roda a leitura do Agendado como ela estava no momento da
-- marca, sem gravar nada, e compara (avaliacaoPura.ts). Nenhuma mudança no bot é publicada se o
-- acerto cair. `verificado` = a equipe/Claude conferiu o esperado do caso (o gerado pode errar:
-- pedido novo nas 12 h seguintes, cancelamento do cliente).

create table if not exists public.bot_casos (
  id                       uuid primary key default gen_random_uuid(),
  chatwoot_conversation_id bigint not null,
  conversation_id          uuid,
  mensagem_id              bigint not null unique,
  marca_em                 timestamptz not null,
  telefone                 text not null,
  esperado                 jsonb not null default '[]'::jsonb,
  verificado               boolean not null default false,
  ativo                    boolean not null default true,
  observacao               text,
  origem                   text not null default 'agendado',
  criado_em                timestamptz not null default now()
);
create index if not exists idx_bot_casos_marca on public.bot_casos (marca_em desc);

create table if not exists public.bot_avaliacoes (
  id          uuid primary key default gen_random_uuid(),
  rodada      text not null,
  caso_id     uuid not null references public.bot_casos(id),
  resultado   text not null check (resultado in ('certo', 'pendente', 'faltou', 'errado', 'erro')),
  diferencas  jsonb not null default '[]'::jsonb,
  lido        jsonb,
  releu       boolean not null default false,
  tokens      jsonb,
  versao      text,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_bot_avaliacoes_rodada on public.bot_avaliacoes (rodada, criado_em);

alter table public.bot_casos enable row level security;
alter table public.bot_avaliacoes enable row level security;
drop policy if exists bot_casos_admin on public.bot_casos;
create policy bot_casos_admin on public.bot_casos for select using (coalesce(fn_has_role(array['admin']::user_role[]), false));
drop policy if exists bot_avaliacoes_admin on public.bot_avaliacoes;
create policy bot_avaliacoes_admin on public.bot_avaliacoes for select using (coalesce(fn_has_role(array['admin']::user_role[]), false));

-- Gera (ou completa) os casos a partir das marcas "Agendado ☑️" da equipe desde `p_desde`.
-- Esperado = viagens do passageiro (ou lançadas por esta marca para outra pessoa) criadas entre a
-- marca e 12 h depois, menos as canceladas em até 30 min (correção de erro, não pedido).
create or replace function public.fn_gerar_casos_bot(p_desde timestamptz default timestamptz '2026-11-10 00:00:00-03')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_novos integer;
begin
  with marcas as (
    select o.chatwoot_message_id mid, o.chatwoot_conversation_id cw, o.conversation_id cid, o.created_at em, w.phone,
           w.telefone_variantes
      from bot_observations o
      join whatsapp_conversations w on w.id = o.conversation_id
     where o.author = 'equipe' and o.created_at >= p_desde
       and o.chatwoot_message_id is not null
       and o.content ~* 'agendad' and o.content ~ '[☑✅✔]'
       and o.content !~ '\?\s*$'
  ),
  alvo as (
    select m.*, (select c.id from customers c
                   where c.deleted_at is null and c.phone = any(m.telefone_variantes)
                   order by c.created_at limit 1) cliente
      from marcas m
  ),
  novos as (
    insert into bot_casos (chatwoot_conversation_id, conversation_id, mensagem_id, marca_em, telefone, esperado)
    select a.cw, a.cid, a.mid, a.em, a.phone,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'trip_date', t.trip_date, 'direction', t.direction, 'route_point_code', rp.code,
                      'quantity', r.quantity, 'pickup_neighborhood', r.pickup_neighborhood, 'type', r.type,
                      'reservation_id', r.id)
                    order by t.trip_date, t.direction)
               from reservations r
               join trips t on t.id = r.trip_id
               left join route_points rp on rp.id = r.route_point_id
              where r.deleted_at is null
                and (r.customer_id = a.cliente or r.whatsapp_source_message_id like 'cw-' || a.mid || '-agendado-%')
                and r.created_at >= a.em - interval '1 minute'
                and r.created_at < a.em + interval '12 hours'
                -- cancelada em até 30 min = a equipe corrigindo um erro; depois disso costuma ser o
                -- passageiro desmarcando ("não vai dar de ir hoje"), e a reserva estava certa
                and not (r.status = 'cancelada' and r.cancelled_at < r.created_at + interval '30 minutes')
           ), '[]'::jsonb)
      from alvo a
    on conflict (mensagem_id) do nothing
    returning 1
  )
  select count(*) into v_novos from novos;
  return v_novos;
end;
$$;

revoke all on function public.fn_gerar_casos_bot(timestamptz) from public, anon, authenticated;
grant execute on function public.fn_gerar_casos_bot(timestamptz) to service_role;

-- 111b — o certo, em alguns casos conferidos, é PERGUNTAR (o cliente não escreveu o dia): a pendência
-- conta como acerto. Casos conferidos à mão ficam com verificado = true e a observação do porquê.
alter table public.bot_casos add column if not exists pendente_ok boolean not null default false;
