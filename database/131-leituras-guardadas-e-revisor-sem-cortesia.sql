-- 131-leituras-guardadas-e-revisor-sem-cortesia.sql — issue #494
--
-- 1) Avaliação sem gastar API: a leitura do modelo para o MESMO texto (modelo, instruções e conversa)
--    fica guardada. Mudança só de código é avaliada sem chamar o modelo. Só as funções (service_role)
--    leem e gravam: RLS ligada, sem política e sem grant (os pedidos lidos têm dados de passageiro).
--    Guardada 30 dias.
-- 2) Revisor: agradecimento, cumprimento e "ok" logo depois da confirmação do bot ou do "Agendado ☑️"
--    não contam como mensagem nova (não relê a conversa por isso). "Ok" em outra situação — resposta a
--    uma pergunta, aceite de outro dia — continua contando. A assinatura dos outros não muda.

create table if not exists public.bot_leituras_memo (
  chave text primary key,
  pedidos jsonb not null,
  divergente boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.bot_leituras_memo enable row level security;
revoke all on table public.bot_leituras_memo from public, anon, authenticated;
grant select, insert, update, delete on table public.bot_leituras_memo to service_role;
create index if not exists idx_bot_leituras_memo_criado on public.bot_leituras_memo (criado_em);

select cron.schedule('limpar-leituras-guardadas', '20 6 * * *',
  $$delete from public.bot_leituras_memo where criado_em < now() - interval '30 days'$$);

-- mensagem que não muda nada: cortesia sempre; aceite curto só logo depois da confirmação
create or replace function public.fn_mensagem_sem_novidade(p_autor text, p_texto text, p_autor_antes text, p_texto_antes text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  with n as (
    select btrim(regexp_replace(translate(lower(coalesce(p_texto, '')),
             'áàâãäéèêëíïóôõöúüç', 'aaaaaeeeeiioooouuc'), '[^a-z0-9]+', ' ', 'g')) t,
           coalesce(p_texto, '') ~ '[👎❌✖🚫?]' nega
  )
  select case
    when p_autor not in ('cliente', 'equipe') or nega then false
    -- mensagem que o bot não leu ("[áudio sem transcrição…]", "[o cliente mandou…]") sempre conta
    when coalesce(p_texto, '') ~ '\[' then false
    when t ~ '^((muito )?(obrigad[oa]s?|brigad[oa]|obg)|valeu|amem|deus (te |lhe )?abencoe|de nada|por nada|bom dia|boa tarde|boa noite|oi+|ola)( (ok|viu|amem|boa noite|bom dia|boa tarde|deus abencoe))?$' then true
    when p_autor = 'cliente'
      and t ~ '^(ok+|okay|certo|certinho|ta certo|ta bom|ta ok|beleza|blz|perfeito|combinado|tudo certo|show|joia|sim|)( (obrigad[oa]|obg|viu))?$'
      and (
        (p_autor_antes = 'bot' and p_texto_antes ~* '(^Prontinho|atualizei sua reserva|^Ol[áa].{0,60}Lembrete da sua viagem)')
        or (p_autor_antes = 'equipe' and p_texto_antes ~* 'agendad[oa]' and p_texto_antes ~ '[☑✅✔]')
      ) then true
    else false
  end
  from n
$function$;
revoke all on function public.fn_mensagem_sem_novidade(text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_mensagem_sem_novidade(text, text, text, text) to service_role;

create or replace function public.fn_assinatura_revisao(p_customer_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with res as (
    select string_agg(concat_ws('|', r.id, r.status, r.trip_id, r.route_point_id, r.pickup_neighborhood, r.pickup_detail,
                                r.street, r.reference_point, r.dropoff_location, r.dropoff_area, r.quantity, r.unit_price, r.type),
                      ',' order by r.id) s
    from reservations r join trips t on t.id = r.trip_id
    where r.customer_id = p_customer_id and r.deleted_at is null and r.status in ('confirmada', 'pendente')
      and t.trip_date >= (now() at time zone 'America/Fortaleza')::date
  ),
  convs as (
    -- índice GIN em telefone_variantes: acha a conversa sem varrer todas
    select w.id from whatsapp_conversations w, customers c
    where c.id = p_customer_id and w.deleted_at is null and w.telefone_variantes && fn_variantes_telefone(c.phone)
  ),
  linhas as (
    select o.created_at, o.author, o.content,
           lag(o.author) over w as autor_antes, lag(o.content) over w as texto_antes
    from bot_observations o
    where o.conversation_id in (select id from convs) and o.author in ('cliente', 'equipe', 'bot')
    window w as (partition by o.conversation_id order by o.created_at, o.id)
  ),
  msg as (
    -- cortesia e "ok" depois da confirmação não são novidade (issue #494)
    select max(l.created_at) ultima from linhas l
    where l.author in ('cliente', 'equipe')
      and not fn_mensagem_sem_novidade(l.author, l.content, l.autor_antes, l.texto_antes)
  )
  select md5(coalesce((select s from res), '') || '#' || coalesce((select ultima::text from msg), ''))
$function$;

-- travas: o que tem de contar e o que não
do $$
begin
  if fn_mensagem_sem_novidade('cliente', 'Ok', 'equipe', 'Só temos vaga na terça, pode ser?') then
    raise exception 'ok em resposta a uma pergunta tem de contar';
  end if;
  if fn_mensagem_sem_novidade('cliente', 'Não vou mais', 'bot', 'Prontinho! ✅ Sua vaga') then
    raise exception 'desistência tem de contar';
  end if;
  if fn_mensagem_sem_novidade('cliente', '👎', 'bot', 'Prontinho! ✅ Sua vaga') then
    raise exception 'negativa em emoji tem de contar';
  end if;
  if fn_mensagem_sem_novidade('cliente', '[áudio sem transcrição — ouça no WhatsApp]', 'bot', 'Prontinho! ✅') then
    raise exception 'áudio tem de contar';
  end if;
  if not fn_mensagem_sem_novidade('cliente', 'Ok', 'bot', E'Prontinho! ✅ Sua vaga está reservada') then
    raise exception 'ok depois da confirmação não é novidade';
  end if;
  if not fn_mensagem_sem_novidade('cliente', 'Muito obrigada 🙏🏾', 'equipe', 'Agendado ☑️') then
    raise exception 'agradecimento não é novidade';
  end if;
  if has_table_privilege('authenticated', 'public.bot_leituras_memo', 'select') or has_table_privilege('anon', 'public.bot_leituras_memo', 'select') then
    raise exception 'bot_leituras_memo só para service_role';
  end if;
end $$;
