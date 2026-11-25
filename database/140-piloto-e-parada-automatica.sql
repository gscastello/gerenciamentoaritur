-- =====================================================================
-- ROTA PIRAPEMAS — 140: piloto do atendente de IA e parada automática (#537)
-- =====================================================================
-- Rodar depois de 01–139. Idempotente. Etapa 3 da autonomia do bot (#501).
--   * O piloto nasce DESLIGADO. Ligado, o atendente responde SÓ aos passageiros da lista; os outros seguem no
--     modo de sempre (sombra). Contato interno (139) nunca entra.
--   * bot_agente_uso: cada vez que o atendente trabalhou, o resultado e o custo.
--   * fn_parada_automatica(): para o piloto sozinho e abre pendência urgente quando: a IA falha 2 vezes em 30
--     min; passa do teto do dia ou do mês; o revisor acha erro do bot (certeza alta) numa reserva do
--     atendente; pessoas mudam o dia, o ponto ou a quantidade de 2 reservas dele em 24 h; ou ele passa 4 das
--     últimas 6 conversas para a equipe. Parado, o bot se cala e a equipe atende.
--   * Religar é sempre de uma pessoa (rpc_piloto, admin; ou a nota "#religar" no Chatwoot).
-- =====================================================================

create table if not exists public.bot_piloto_clientes (
  customer_id uuid primary key references public.customers (id),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.bot_piloto_clientes enable row level security;
revoke all on public.bot_piloto_clientes from anon, authenticated;
grant select, insert, update on public.bot_piloto_clientes to authenticated;
grant select, insert, update on public.bot_piloto_clientes to service_role;
drop policy if exists bot_piloto_clientes_select on public.bot_piloto_clientes;
create policy bot_piloto_clientes_select on public.bot_piloto_clientes for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente']::user_role[])));
drop policy if exists bot_piloto_clientes_insert on public.bot_piloto_clientes;
create policy bot_piloto_clientes_insert on public.bot_piloto_clientes for insert to authenticated
  with check ((select fn_has_role(array['admin']::user_role[])));
drop policy if exists bot_piloto_clientes_update on public.bot_piloto_clientes;
create policy bot_piloto_clientes_update on public.bot_piloto_clientes for update to authenticated
  using ((select fn_has_role(array['admin']::user_role[]))) with check ((select fn_has_role(array['admin']::user_role[])));
drop trigger if exists trg_somente_leitura on public.bot_piloto_clientes;
create trigger trg_somente_leitura before insert or update or delete on public.bot_piloto_clientes
  for each statement execute function public.fn_trava_somente_leitura();

create table if not exists public.bot_agente_uso (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  chatwoot_conversation_id bigint,
  resultado text not null check (resultado in ('respondeu', 'silencio', 'transferiu', 'sem_resposta', 'erro')),
  custo_usd numeric not null default 0,
  detalhe text,
  em timestamptz not null default now()
);
create index if not exists idx_bot_agente_uso_em on public.bot_agente_uso (em);
alter table public.bot_agente_uso enable row level security;
revoke all on public.bot_agente_uso from anon, authenticated;
grant select on public.bot_agente_uso to authenticated;
grant select, insert on public.bot_agente_uso to service_role;
drop policy if exists bot_agente_uso_select on public.bot_agente_uso;
create policy bot_agente_uso_select on public.bot_agente_uso for select to authenticated
  using ((select fn_has_role(array['admin']::user_role[])));
drop trigger if exists trg_somente_leitura on public.bot_agente_uso;
create trigger trg_somente_leitura before insert or update or delete on public.bot_agente_uso
  for each statement execute function public.fn_trava_somente_leitura();

-- piloto desligado e teto por dia; o que já existe na configuração fica como está
update public.settings
   set value = value || jsonb_build_object('piloto', '{"ligado": false, "teto_usd_dia": 1}'::jsonb)
 where key = 'bot_autonomia' and not value ? 'piloto';

/** O atendente pode responder a este telefone? (ligado, sem parada, na lista e não é contato interno) */
create or replace function public.fn_piloto_vale(p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((s.value #>> '{piloto,ligado}')::boolean, false)
     and s.value #> '{piloto,parada}' is null
     and not fn_contato_interno(p_phone)
     and exists (
       select 1 from bot_piloto_clientes p join customers c on c.id = p.customer_id
        where p.removed_at is null and c.deleted_at is null
          and (c.phone = any (fn_variantes_telefone(p_phone)) or c.phone_secondary = any (fn_variantes_telefone(p_phone))))
    from settings s where s.key = 'bot_autonomia';
$$;
revoke all on function public.fn_piloto_vale(text) from public, anon, authenticated;
grant execute on function public.fn_piloto_vale(text) to service_role;

/** Para o piloto (uma vez) e abre a pendência urgente. */
create or replace function public.fn_piloto_parar(p_motivo text, p_quem text default 'automatica')
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update settings
     set value = jsonb_set(value, '{piloto,parada}', jsonb_build_object('motivo', left(p_motivo, 400), 'quem', p_quem, 'em', now()))
   where key = 'bot_autonomia' and value #> '{piloto,parada}' is null and coalesce((value #>> '{piloto,ligado}')::boolean, false);
  if not found then
    return false;
  end if;
  insert into support_tickets (source, subject, detail, status, meta)
  values ('sistema', 'Atendente de IA parou', 'O atendente de IA parou sozinho e a equipe precisa atender os passageiros do piloto. Motivo: ' || p_motivo || '. Para religar: escreva a nota privada "#religar" no Chatwoot depois de conferir.', 'aberta', jsonb_build_object('urgente', true, 'piloto', true));
  return true;
end;
$$;
revoke all on function public.fn_piloto_parar(text, text) from public, anon, authenticated;
grant execute on function public.fn_piloto_parar(text, text) to service_role;

/** Religar é de uma pessoa: zera o que contou antes da parada. */
create or replace function public.fn_piloto_religar(p_quem text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update settings
     set value = jsonb_set(value #- '{piloto,parada}', '{piloto,religado}', jsonb_build_object('quem', p_quem, 'em', now()))
   where key = 'bot_autonomia' and value #> '{piloto,parada}' is not null;
  return found;
end;
$$;
revoke all on function public.fn_piloto_religar(text) from public, anon, authenticated;
grant execute on function public.fn_piloto_religar(text) to service_role;

/** Confere os sinais e para, se for o caso. Devolve o motivo da parada (null = segue). */
create or replace function public.fn_parada_automatica()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cfg jsonb;
  v_desde timestamptz;
  v_bot uuid;
  v_n int;
  v_custo numeric;
  v_motivo text;
begin
  select value into v_cfg from settings where key = 'bot_autonomia';
  if not coalesce((v_cfg #>> '{piloto,ligado}')::boolean, false) or v_cfg #> '{piloto,parada}' is not null then
    return null;
  end if;
  -- o que aconteceu antes de uma pessoa religar não conta de novo
  v_desde := coalesce((v_cfg #>> '{piloto,religado,em}')::timestamptz, '-infinity'::timestamptz);
  select id into v_bot from users where name = 'Bot WhatsApp' and deleted_at is null limit 1;

  select count(*) into v_n from bot_agente_uso
   where resultado in ('erro', 'sem_resposta') and em > greatest(now() - interval '30 minutes', v_desde);
  if v_n >= 2 then
    v_motivo := 'a IA falhou ' || v_n || ' vezes em 30 minutos';
  end if;

  if v_motivo is null then
    select coalesce(sum(custo_usd), 0) into v_custo from bot_agente_uso
     where em >= greatest(date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza', v_desde);
    if v_custo >= coalesce((v_cfg #>> '{piloto,teto_usd_dia}')::numeric, 1) then
      v_motivo := 'passou do teto do dia (US$ ' || round(v_custo, 2) || ')';
    end if;
  end if;
  if v_motivo is null then
    select coalesce(sum(custo_usd), 0) into v_custo from bot_agente_uso
     where em >= date_trunc('month', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza';
    if v_custo >= coalesce((v_cfg ->> 'teto_usd_mes')::numeric, 120) then
      v_motivo := 'passou do teto do mês (US$ ' || round(v_custo, 2) || ')';
    end if;
  end if;

  -- o revisor achou erro do bot, com certeza alta, numa reserva do atendente
  if v_motivo is null then
    select count(*) into v_n
      from revisoes_reservas x
      cross join lateral jsonb_array_elements(case when jsonb_typeof(x.achados) = 'array' then x.achados else '[]'::jsonb end) a
      join reservations r on r.id::text = a.value ->> 'reserva_id'
     where x.revisado_em > greatest(now() - interval '24 hours', v_desde)
       and a.value ->> 'quem_errou' = 'bot' and a.value ->> 'certeza' = 'alta'
       and a.value ->> 'campo' in ('data', 'sentido', 'ponto', 'quantidade', 'tipo')
       and r.extra_data ->> 'origem' = 'agente';
    if v_n > 0 then
      v_motivo := 'o revisor achou erro do bot em reserva feita pelo atendente de IA';
    end if;
  end if;

  -- pessoas tiveram de mudar o dia, o ponto ou a quantidade de 2 reservas dele em 24 h
  if v_motivo is null then
    select count(distinct r.id) into v_n
      from audit_logs l join reservations r on r.id = l.entity_id
     where l.entity_table = 'reservations' and l.action = 'update' and l.performed_by is distinct from v_bot and l.performed_by is not null
       and l.performed_at > greatest(now() - interval '24 hours', v_desde)
       and r.extra_data ->> 'origem' = 'agente' and l.performed_at < r.created_at + interval '48 hours'
       and (l.before_data -> 'trip_id' is distinct from l.after_data -> 'trip_id'
            or l.before_data -> 'route_point_id' is distinct from l.after_data -> 'route_point_id'
            or l.before_data -> 'quantity' is distinct from l.after_data -> 'quantity');
    if v_n >= 2 then
      v_motivo := 'a equipe corrigiu ' || v_n || ' reservas do atendente de IA em 24 horas';
    end if;
  end if;

  if v_motivo is null then
    select count(*) filter (where resultado = 'transferiu') into v_n
      from (select resultado from bot_agente_uso where em > greatest(now() - interval '3 hours', v_desde) and resultado <> 'silencio' order by em desc limit 6) u;
    if v_n >= 4 then
      v_motivo := 'passou ' || v_n || ' das últimas 6 conversas para a equipe';
    end if;
  end if;

  if v_motivo is not null and fn_piloto_parar(v_motivo) then
    return v_motivo;
  end if;
  return null;
end;
$$;
revoke all on function public.fn_parada_automatica() from public, anon, authenticated;
grant execute on function public.fn_parada_automatica() to service_role;

/** Painel (admin): ligar/desligar, parar e religar. */
create or replace function public.rpc_piloto(p_acao text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_quem text;
begin
  if not coalesce(fn_has_role(array['admin']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  select coalesce(name, 'admin') into v_quem from users where id = auth.uid();
  if p_acao = 'parar' then
    perform fn_piloto_parar('parado por ' || v_quem, v_quem);
  elsif p_acao = 'religar' then
    perform fn_piloto_religar(v_quem);
  elsif p_acao in ('ligar', 'desligar') then
    update settings set value = jsonb_set(value, '{piloto,ligado}', to_jsonb(p_acao = 'ligar')) where key = 'bot_autonomia';
  else
    return jsonb_build_object('success', false, 'message', 'Ação desconhecida.');
  end if;
  return jsonb_build_object('success', true, 'piloto', (select value -> 'piloto' from settings where key = 'bot_autonomia'));
end;
$$;
revoke all on function public.rpc_piloto(text) from public, anon;
grant execute on function public.rpc_piloto(text) to authenticated;

select cron.schedule('parada-automatica', '*/5 * * * *', 'select public.fn_parada_automatica();');
