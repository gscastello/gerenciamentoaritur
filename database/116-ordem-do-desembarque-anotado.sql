-- 116 — Ordem da lista de desembarque anotada (issue #440).
--
-- O dono organiza o que anotou na Rota → Desembarque. A ordem vai em cada linha (`ordem`,
-- número): mover uma linha só muda essa linha e a junção continua por linha (vale o `em` mais
-- recente), então dois aparelhos na mesma viagem não se atrapalham. Sem `ordem`, a linha fica pela
-- hora em que foi anotada. Mesma regra de frontend/src/domain/listaDesembarque.js
-- (posicaoDaLinha, mesclarListas).
--
-- Muda só rpc_salvar_lista_desembarque (database/106): guarda `ordem` quando é número (antes o
-- campo era descartado na junção).

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
    select jsonb_strip_nulls(jsonb_build_object(
             'id', left(x ->> 'id', 64),
             'texto', left(coalesce(x ->> 'texto', ''), 200),
             'feito', coalesce((x ->> 'feito')::boolean, false),
             'apagada', coalesce((x ->> 'apagada')::boolean, false),
             'criada', x ->> 'criada',
             'em', x ->> 'em',
             -- a posição dada em "Organizar" (issue #440); sem ela, vale a hora em que foi anotada
             'ordem', case when jsonb_typeof(x -> 'ordem') = 'number' then x -> 'ordem' end)) as x
      from todas
     where jsonb_typeof(x) = 'object' and coalesce(x ->> 'id', '') <> ''
       and coalesce(x ->> 'em', '') <> '' and coalesce(x ->> 'criada', '') <> ''
  ),
  escolhidas as (
    select distinct on (x ->> 'id') x from validas order by x ->> 'id', x ->> 'em' desc
  )
  -- a ordem da tela sai de `ordem` no app (que junta e ordena de novo); aqui fica a de criação
  select coalesce(jsonb_agg(x order by x ->> 'criada', x ->> 'id'), '[]'::jsonb) into v_final from escolhidas;

  update listas_desembarque
     set linhas = v_final, updated_at = now(), updated_by = auth.uid()
   where trip_date = p_data and direction = p_direcao;
  return v_final;
end $$;

revoke all on function public.rpc_salvar_lista_desembarque(date, trip_direction, jsonb) from public, anon;
grant execute on function public.rpc_salvar_lista_desembarque(date, trip_direction, jsonb) to authenticated;
