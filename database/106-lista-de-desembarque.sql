-- =====================================================================
-- ROTA PIRAPEMAS — 106: LISTA DE DESEMBARQUE ANOTADA NA VIAGEM (#383)
-- =====================================================================
-- Rodar depois de 01–105. Idempotente.
-- Em Lista do Dia → Desembarque, quem está na viagem anota à mão onde cada
-- passageiro desce (texto livre, linha por linha). Decisões do dono (13/11):
-- a lista começa em branco e NÃO muda a reserva (nem o valor da Volta).
--
-- Uma lista por dia e sentido. Cada linha: { id, texto, feito, apagada, criada, em }.
-- O app grava primeiro no aparelho (na estrada o sinal cai) e envia depois; por
-- isso salvar JUNTA as linhas em vez de trocar a lista inteira: para cada id
-- fica a versão com o `em` mais recente (mesma regra de
-- frontend/src/domain/listaDesembarque.js → mesclarListas). Apagar é marcar
-- `apagada`, para a linha apagada num aparelho não voltar pelo outro.
-- =====================================================================

create table if not exists public.listas_desembarque (
  trip_date   date not null,
  direction   trip_direction not null,
  linhas      jsonb not null default '[]'::jsonb check (jsonb_typeof(linhas) = 'array'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id),
  primary key (trip_date, direction)
);

alter table public.listas_desembarque enable row level security;
drop policy if exists listas_desembarque_select on public.listas_desembarque;
create policy listas_desembarque_select on public.listas_desembarque for select to authenticated
  using ((select fn_has_role(array['admin', 'atendente', 'motorista', 'financeiro']::user_role[])));
revoke all on public.listas_desembarque from anon, authenticated;
grant select on public.listas_desembarque to authenticated;

-- Junta as linhas enviadas com as que já estão no banco e devolve a lista final.
create or replace function public.rpc_salvar_lista_desembarque(p_data date, p_direcao trip_direction, p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final jsonb;
begin
  if not (select fn_has_role(array['admin', 'atendente', 'motorista']::user_role[])) then
    raise exception 'Sem permissão para anotar o desembarque.' using errcode = '42501';
  end if;
  if p_data is null or p_direcao is null or jsonb_typeof(coalesce(p_linhas, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_linhas) > 300 then
    raise exception 'Lista grande demais (máximo 300 linhas).' using errcode = '22023';
  end if;

  -- trava a linha da viagem para dois aparelhos não juntarem ao mesmo tempo
  insert into listas_desembarque (trip_date, direction) values (p_data, p_direcao)
  on conflict (trip_date, direction) do nothing;
  perform 1 from listas_desembarque where trip_date = p_data and direction = p_direcao for update;

  with todas as (
    select x from listas_desembarque l, jsonb_array_elements(l.linhas) x
     where l.trip_date = p_data and l.direction = p_direcao
    union all
    select x from jsonb_array_elements(p_linhas) x
  ),
  validas as (
    select jsonb_build_object(
             'id', left(x ->> 'id', 64),
             'texto', left(coalesce(x ->> 'texto', ''), 200),
             'feito', coalesce((x ->> 'feito')::boolean, false),
             'apagada', coalesce((x ->> 'apagada')::boolean, false),
             'criada', x ->> 'criada',
             'em', x ->> 'em') as x
      from todas
     where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') <> ''
       and coalesce(x ->> 'em', '') <> '' and coalesce(x ->> 'criada', '') <> ''
  ),
  escolhidas as (
    select distinct on (x ->> 'id') x from validas order by x ->> 'id', x ->> 'em' desc
  )
  select coalesce(jsonb_agg(x order by x ->> 'criada', x ->> 'id'), '[]'::jsonb) into v_final from escolhidas;

  update listas_desembarque
     set linhas = v_final, updated_at = now(), updated_by = auth.uid()
   where trip_date = p_data and direction = p_direcao;
  return v_final;
end $$;

revoke all on function public.rpc_salvar_lista_desembarque(date, trip_direction, jsonb) from public, anon;
grant execute on function public.rpc_salvar_lista_desembarque(date, trip_direction, jsonb) to authenticated;

-- Tempo real: dois aparelhos na mesma viagem veem as anotações um do outro.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listas_desembarque'
  ) then
    execute 'alter publication supabase_realtime add table public.listas_desembarque';
  end if;
end $$;
