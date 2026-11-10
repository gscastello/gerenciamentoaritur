-- =====================================================================
-- ROTA PIRAPEMAS — 87: ASSISTENTE PELA SIRI (#290)
-- =====================================================================
-- Rodar depois de 01–86. Idempotente.
-- O atalho do iPhone fala com a Edge Function `assistente-voz` usando uma
-- CHAVE PESSOAL da pessoa (gerada na aba Assistente). A chave aparece uma vez;
-- aqui fica só o hash (sha256). Apagar a chave = o atalho para de funcionar.
-- `assistente_voz_sessao` guarda a conversa por voz e a proposta pendente
-- (10 min), para o "sim" gravar a proposta certa. Só o servidor lê e grava.
-- =====================================================================

create table if not exists public.assistente_chaves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  nome         text not null default 'iPhone',
  hash         text not null unique,
  final        text not null,          -- últimos 4 caracteres, para reconhecer na lista
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists idx_assistente_chaves_user on public.assistente_chaves (user_id);

alter table public.assistente_chaves enable row level security;
revoke all on public.assistente_chaves from anon, public;
grant select on public.assistente_chaves to authenticated;
drop policy if exists assistente_chaves_select on public.assistente_chaves;
create policy assistente_chaves_select on public.assistente_chaves
  for select to authenticated
  using (user_id = (select auth.uid()) or (select fn_has_role(array['admin']::user_role[])));

create table if not exists public.assistente_voz_sessao (
  user_id    uuid primary key references public.users(id),
  historico  jsonb not null default '[]'::jsonb,
  pendentes  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.assistente_voz_sessao enable row level security;
revoke all on public.assistente_voz_sessao from anon, public, authenticated;

-- gera uma chave para quem está logado (equipe) e devolve o texto UMA vez
create or replace function public.rpc_criar_chave_assistente(p_nome text default 'iPhone')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_chave text;
  v_id uuid;
begin
  if v_uid is null or not coalesce(fn_has_role(array['admin','atendente','financeiro']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if (select count(*) from assistente_chaves where user_id = v_uid and revoked_at is null) >= 5 then
    return jsonb_build_object('success', false, 'message', 'Você já tem 5 chaves ativas. Apague uma antes.');
  end if;
  v_chave := 'ari_' || encode(gen_random_bytes(20), 'hex');
  insert into assistente_chaves (user_id, nome, hash, final)
  values (v_uid, left(coalesce(nullif(btrim(p_nome), ''), 'iPhone'), 40),
          encode(digest(v_chave, 'sha256'), 'hex'), right(v_chave, 4))
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id, 'chave', v_chave);
end $$;

-- apaga (revoga) uma chave sua; admin pode apagar qualquer uma
create or replace function public.rpc_revogar_chave_assistente(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update assistente_chaves set revoked_at = now()
   where id = p_id and revoked_at is null
     and (user_id = v_uid or coalesce(fn_has_role(array['admin']::user_role[]), false));
  if not found then
    return jsonb_build_object('success', false, 'message', 'Chave não encontrada.');
  end if;
  return jsonb_build_object('success', true);
end $$;

revoke all on function public.rpc_criar_chave_assistente(text) from public, anon;
revoke all on function public.rpc_revogar_chave_assistente(uuid) from public, anon;
grant execute on function public.rpc_criar_chave_assistente(text) to authenticated;
grant execute on function public.rpc_revogar_chave_assistente(uuid) to authenticated;
