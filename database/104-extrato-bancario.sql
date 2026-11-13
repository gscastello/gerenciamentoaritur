-- =====================================================================
-- ROTA PIRAPEMAS — 104: EXTRATO DO BANCO (#364)
-- =====================================================================
-- Rodar depois de 01–103. Idempotente.
-- O dono manda o extrato do mês (OFX ou CSV, InfinitePay e outros bancos). O
-- app lê o arquivo (frontend/src/domain/extrato.js) e guarda cada movimento
-- aqui UMA vez (chave única: id do banco, ou data+valor+descrição+ordem). A
-- conferência com os lançamentos e os pagamentos é feita no app, na hora.
-- "Lançar o que falta" passa pela RPC: o lançamento sai do próprio movimento
-- (data, tipo pelo sinal, valor) e fica ligado a ele, numa transação só — dois
-- toques no mesmo movimento não lançam duas vezes.
-- Só admin e financeiro. Nada é apagado: o que não entra fica "ignorada".
-- =====================================================================

create table if not exists public.extrato_linhas (
  id                  uuid primary key default gen_random_uuid(),
  conta               text not null check (length(btrim(conta)) between 1 and 80),
  data                date not null,
  valor               numeric(12, 2) not null check (valor <> 0),
  descricao           text not null default '',
  documento           text,
  chave               text not null unique,
  arquivo             text,
  financial_entry_id  uuid references public.financial_entries(id) on delete set null,
  ignorada            boolean not null default false,
  importado_por       uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_extrato_linhas_data on public.extrato_linhas (data);
create index if not exists idx_extrato_linhas_entry on public.extrato_linhas (financial_entry_id)
  where financial_entry_id is not null;

drop trigger if exists trg_extrato_linhas_updated_at on public.extrato_linhas;
create trigger trg_extrato_linhas_updated_at before update on public.extrato_linhas
  for each row execute function public.fn_set_updated_at();

alter table public.extrato_linhas enable row level security;
drop policy if exists extrato_linhas_select on public.extrato_linhas;
create policy extrato_linhas_select on public.extrato_linhas for select to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])));
drop policy if exists extrato_linhas_insert on public.extrato_linhas;
create policy extrato_linhas_insert on public.extrato_linhas for insert to authenticated
  with check ((select fn_has_role(array['admin', 'financeiro']::user_role[])) and financial_entry_id is null);
drop policy if exists extrato_linhas_update on public.extrato_linhas;
create policy extrato_linhas_update on public.extrato_linhas for update to authenticated
  using ((select fn_has_role(array['admin', 'financeiro']::user_role[])))
  with check ((select fn_has_role(array['admin', 'financeiro']::user_role[])));
revoke all on public.extrato_linhas from anon, authenticated;
grant select, insert on public.extrato_linhas to authenticated;
-- pela tela só se marca/desmarca "ignorada"; o vínculo com o lançamento é da RPC
grant update (ignorada) on public.extrato_linhas to authenticated;

-- Lançar um movimento que falta no Financeiro (um toque na tela).
create or replace function public.rpc_lancar_movimento(p_linha uuid, p_categoria text, p_descricao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l extrato_linhas%rowtype;
  v_entry uuid;
begin
  if not (select fn_has_role(array['admin', 'financeiro']::user_role[])) then
    return jsonb_build_object('success', false, 'message', 'Só admin e financeiro lançam pelo extrato.');
  end if;
  select * into l from extrato_linhas where id = p_linha for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Movimento não encontrado.');
  end if;
  if l.financial_entry_id is not null then
    return jsonb_build_object('success', true, 'financial_entry_id', l.financial_entry_id, 'ja_lancado', true);
  end if;
  insert into financial_entries (entry_date, type, category, amount, description, created_by)
  values (l.data,
          case when l.valor > 0 then 'receita' else 'despesa' end::financial_entry_type,
          coalesce(nullif(btrim(p_categoria), ''), 'outro'),
          abs(l.valor),
          left(coalesce(nullif(btrim(p_descricao), ''), nullif(l.descricao, ''), 'Movimento do extrato') || ' (extrato)', 300),
          auth.uid())
  returning id into v_entry;
  update extrato_linhas set financial_entry_id = v_entry, ignorada = false where id = l.id;
  return jsonb_build_object('success', true, 'financial_entry_id', v_entry, 'ja_lancado', false);
end $$;

revoke all on function public.rpc_lancar_movimento(uuid, text, text) from public, anon;
grant execute on function public.rpc_lancar_movimento(uuid, text, text) to authenticated;
