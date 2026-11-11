-- =====================================================================
-- ROTA PIRAPEMAS — 94: O ASSISTENTE ENSINA O BOT (#318)
-- =====================================================================
-- Rodar depois de 01–93. Idempotente.
-- Pedido do dono (11/11): o que ele informa e corrige pelo assistente (app e Siri)
-- tem de virar aprendizado do bot. Duas portas, sempre depois do "Confirmar":
--   rpc_ensinar_ao_bot → lição em bot_learnings (o bot usa as "ativa");
--   rpc_ensinar_lugar  → lugar de Pirapemas/Cantanhede (cidade_lugares) ou lugar
--                        de São Luís → bairro (bairro_aliases + sao_luis_lugares).
-- Quem ensina: admin (vale na hora, já revisado) ou atendente (segue as regras do
-- aprendizado: fato/negócio esperam o dono). Preço nunca entra por lição (é da
-- tabela) e telefone nunca entra em lição.
-- p_actor só vale para o servidor (Siri, sem auth.uid()); com login vale auth.uid().
-- =====================================================================

create or replace function public.fn_papel_de(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select role::text from users where id = p_user and deleted_at is null and coalesce(active, true)
$$;
revoke all on function public.fn_papel_de(uuid) from public, anon, authenticated;

create or replace function public.rpc_ensinar_ao_bot(
  p_tipo text,
  p_titulo text,
  p_conteudo text,
  p_actor uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), case when auth.role() = 'service_role' then p_actor end);
  v_papel text := fn_papel_de(v_actor);
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_conteudo text := btrim(coalesce(p_conteudo, ''));
  v_status text;
  v_id uuid;
begin
  if v_papel is null or v_papel not in ('admin', 'atendente') then
    return jsonb_build_object('success', false, 'message', 'Só admin ou atendente ensina o bot.');
  end if;
  if p_tipo not in ('linguagem_cliente', 'estilo_atendente', 'fluxo_agendamento', 'situacao', 'operacao', 'fato', 'negocio') then
    return jsonb_build_object('success', false, 'message', 'Tipo de lição inválido.');
  end if;
  if length(v_titulo) < 3 or length(v_titulo) > 120 or length(v_conteudo) < 10 or length(v_conteudo) > 800 then
    return jsonb_build_object('success', false, 'message', 'Lição curta ou longa demais (título 3–120, texto 10–800 letras).');
  end if;
  if (v_titulo || ' ' || v_conteudo) ~* '(r\$|\mreais\M)' then
    return jsonb_build_object('success', false, 'message', 'Preço não vai em lição: o bot usa a tabela (Sistema → Bairros / Trechos / Locais).');
  end if;
  if regexp_replace(v_titulo || ' ' || v_conteudo, '\D', '', 'g') ~ '\d{8,}' then
    return jsonb_build_object('success', false, 'message', 'Lição não guarda telefone nem documento.');
  end if;

  v_status := case
    when v_papel = 'admin' then 'ativa'
    when p_tipo in ('fato', 'negocio') then 'proposta'
    when p_tipo = 'situacao' and v_conteudo ~ '\d' then 'proposta'
    else 'ativa'
  end;

  -- a mesma lição (mesmo título) ensinada de novo atualiza a que existe
  select id into v_id from bot_learnings
  where fn_normalizar_local(title) = fn_normalizar_local(v_titulo) and status in ('ativa', 'proposta')
  order by (status = 'ativa') desc, last_seen_at desc
  limit 1;

  if v_id is not null then
    update bot_learnings set
      kind = p_tipo, content = v_conteudo,
      status = case when v_papel = 'admin' then 'ativa' else status end,
      needs_review = (v_papel <> 'admin'),
      reviewed_at = case when v_papel = 'admin' then now() else reviewed_at end,
      reviewed_by = case when v_papel = 'admin' then v_actor else reviewed_by end,
      evidence_count = evidence_count + 1, last_seen_at = now(), updated_at = now()
    where id = v_id;
  else
    insert into bot_learnings (kind, title, content, status, needs_review, evidence_count, first_seen_at, last_seen_at, reviewed_at, reviewed_by)
    values (p_tipo, v_titulo, v_conteudo, v_status, v_papel <> 'admin', 1, now(), now(),
            case when v_papel = 'admin' then now() end, case when v_papel = 'admin' then v_actor end)
    returning id into v_id;
  end if;

  return jsonb_build_object('success', true, 'id', v_id,
    'status', (select status from bot_learnings where id = v_id),
    'message', case when (select status from bot_learnings where id = v_id) = 'ativa'
                    then 'O bot já usa essa lição.' else 'Lição guardada; vale depois que o dono aprovar.' end);
end
$$;
revoke all on function public.rpc_ensinar_ao_bot(text, text, text, uuid) from public, anon;
grant execute on function public.rpc_ensinar_ao_bot(text, text, text, uuid) to authenticated, service_role;

create or replace function public.rpc_ensinar_lugar(
  p_cidade text,
  p_nome text,
  p_bairro text default null,
  p_actor uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), case when auth.role() = 'service_role' then p_actor end);
  v_papel text := fn_papel_de(v_actor);
  v_nome text := btrim(coalesce(p_nome, ''));
  v_bairro text;
  v_fonte text;
  p record;
  v_n integer := 0;
begin
  if v_papel is null or v_papel not in ('admin', 'atendente') then
    return jsonb_build_object('success', false, 'message', 'Só admin ou atendente ensina lugares ao bot.');
  end if;
  if length(v_nome) < 3 or length(v_nome) > 120 then
    return jsonb_build_object('success', false, 'message', 'Nome do lugar inválido.');
  end if;
  v_fonte := case when v_papel = 'admin' then 'dono' else 'equipe' end;

  if p_cidade in ('pirapemas', 'cantanhede') then
    for p in select distinct on (x.nucleo) x.tipo, x.nucleo from fn_pedacos_do_endereco(v_nome) x where length(x.nucleo) >= 3 loop
      insert into cidade_lugares (cidade, nome, nucleo, tipo, fonte, ocorrencias)
      values (p_cidade, fn_nome_do_lugar(p.nucleo, p.tipo), p.nucleo,
              case when p.tipo in ('rua', 'referencia', 'casa', 'povoado') then p.tipo else 'referencia' end, v_fonte, 0)
      on conflict (cidade, nucleo) do update
        set fonte = case when cidade_lugares.fonte = 'reservas' then excluded.fonte else cidade_lugares.fonte end,
            updated_at = now();
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then
      return jsonb_build_object('success', false, 'message', 'Não reconheci o lugar nesse texto.');
    end if;
    return jsonb_build_object('success', true, 'lugares', v_n,
      'message', format('O bot já sabe que %s fica em %s.', v_nome, initcap(p_cidade)));
  end if;

  if p_cidade = 'sao_luis' then
    select np.neighborhood::text into v_bairro from neighborhood_pricing np
    where fn_normalizar_local(np.neighborhood::text) = fn_normalizar_local(p_bairro) limit 1;
    if v_bairro is null then
      return jsonb_build_object('success', false, 'message', 'Esse bairro não está na tabela de bairros (Sistema → Bairros).');
    end if;
    insert into bairro_aliases (apelido, bairro, fonte, confirmado, evidencia)
    values (v_nome, v_bairro, 'equipe', true, 'ensinado pelo assistente')
    on conflict (fn_normalizar_local(apelido)) do update
      set bairro = excluded.bairro, fonte = 'equipe', confirmado = true, updated_at = now();
    for p in select distinct on (x.nucleo) x.tipo, x.nucleo from fn_pedacos_do_endereco(v_nome) x where fn_pedaco_util_sao_luis(x.nucleo) loop
      insert into sao_luis_lugares (nucleo, nome, tipo, bairro, fonte, confirmado)
      values (p.nucleo, fn_nome_do_lugar(p.nucleo, p.tipo), p.tipo, v_bairro, 'equipe', true)
      on conflict (nucleo, bairro) do update set confirmado = true, updated_at = now();
      v_n := v_n + 1;
    end loop;
    return jsonb_build_object('success', true, 'lugares', v_n,
      'message', format('O bot já sabe que %s fica no bairro %s.', v_nome, v_bairro));
  end if;

  return jsonb_build_object('success', false, 'message', 'Cidade inválida (pirapemas, cantanhede ou sao_luis).');
end
$$;
revoke all on function public.rpc_ensinar_lugar(text, text, text, uuid) from public, anon;
grant execute on function public.rpc_ensinar_lugar(text, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------
do $$
begin
  if (select (rpc_ensinar_ao_bot('fato', 'Teste', 'Sem ninguém logado não grava.'))->>'success') <> 'false' then
    raise exception 'ensinar sem login gravou';
  end if;
  if (select (rpc_ensinar_lugar('pirapemas', 'Rua Teste'))->>'success') <> 'false' then
    raise exception 'ensinar lugar sem login gravou';
  end if;
end $$;
