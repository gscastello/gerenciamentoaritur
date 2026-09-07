-- =====================================================================
-- ROTA PIRAPEMAS — 22: CATEGORIAS DE DESPESA EDITÁVEIS (aba Gestão)
-- =====================================================================
-- Antes: as 14 categorias de custo empresarial eram fixas (check-constraint
-- em recurring_expense_templates.category) e as de caixa (combustível,
-- alimentação...) eram fixas no frontend. Pedido do dono: criar / renomear
-- / agrupar categorias pelo app.
--
-- Agora: uma tabela `expense_categories` (slug + rótulo + grupo + ícone),
-- usada pela aba Gestão (custos recorrentes) e pelo Financeiro (lançamento
-- manual de despesa). O check rígido sai; `category` continua text em
-- financial_entries / recurring_expense_templates (histórico intacto), só
-- que a UI passa a oferecer a lista da tabela + "nova categoria".
--
-- Rodar depois de 01-21. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela de categorias
-- ---------------------------------------------------------------------
create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,                          -- id estável usado em financial_entries.category
  label       text not null,
  grupo       text not null default 'Estrutura',
  kind        text not null default 'gestao'
                check (kind in ('gestao', 'despesa', 'ambos')),
  icon        text,                                   -- nome do ícone lucide (opcional)
  sort_order  int  not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  updated_by  uuid references public.users(id),
  deleted_at  timestamptz
);
create unique index if not exists uq_expense_categories_slug
  on public.expense_categories (slug) where deleted_at is null;
create index if not exists idx_expense_categories_active
  on public.expense_categories (active, kind) where deleted_at is null;

drop trigger if exists trg_expense_categories_updated_at on public.expense_categories;
create trigger trg_expense_categories_updated_at before update
  on public.expense_categories
  for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2) Seed — as 14 de Gestão + as 5 do caixa (com os slugs que já estão
--    em uso em financial_entries). on conflict do nothing => não mexe no
--    que o dono já customizou.
-- ---------------------------------------------------------------------
insert into public.expense_categories (slug, label, grupo, kind, icon, sort_order) values
  ('salario',               'Salários',                    'Pessoal',          'gestao',  'Users',       10),
  ('pro_labore',            'Pró-labore',                  'Pessoal',          'gestao',  'Users',       20),
  ('imposto',               'Impostos',                    'Impostos & Taxas', 'gestao',  'Landmark',    30),
  ('taxa_bancaria',         'Taxas bancárias',             'Impostos & Taxas', 'gestao',  'Landmark',    40),
  ('taxa_cartao',           'Taxas de cartão',             'Impostos & Taxas', 'gestao',  'CreditCard',  50),
  ('seguro',                'Seguro',                      'Veículo',          'gestao',  'ShieldCheck', 60),
  ('ipva',                  'IPVA / Licenciamento',        'Veículo',          'gestao',  'Receipt',     70),
  ('pneu',                  'Pneus',                       'Veículo',          'gestao',  'Bus',         80),
  ('lavagem',               'Lavagem',                     'Veículo',          'gestao',  'Sparkles',    90),
  ('peca',                  'Peças',                       'Veículo',          'gestao',  'Package',    100),
  ('manutencao_corretiva',  'Manutenção corretiva',        'Veículo',          'gestao',  'Wrench',     110),
  ('depreciacao',           'Depreciação',                 'Estrutura',        'gestao',  'TrendingUp', 120),
  ('despesa_administrativa','Despesas administrativas',    'Estrutura',        'gestao',  'Receipt',    130),
  ('outro_recorrente',      'Outras despesas recorrentes', 'Estrutura',        'gestao',  'Receipt',    140),
  ('combustivel',           'Combustível',                 'Caixa do dia',     'despesa', 'Fuel',        10),
  ('alimentacao',           'Alimentação',                 'Caixa do dia',     'despesa', 'UtensilsCrossed', 20),
  ('motorista',             'Motorista(s)',                'Caixa do dia',     'despesa', 'Users',       30),
  ('manutencao',            'Manutenção',                  'Caixa do dia',     'despesa', 'Wrench',      40),
  ('outro',                 'Outro',                       'Caixa do dia',     'despesa', 'Receipt',     50)
on conflict (slug) where deleted_at is null do nothing;

-- ---------------------------------------------------------------------
-- 3) Solta a categoria de recurring_expense_templates (agora é livre —
--    a UI valida contra expense_categories, mas o banco só exige texto).
-- ---------------------------------------------------------------------
alter table public.recurring_expense_templates
  drop constraint if exists recurring_expense_templates_category_check;
alter table public.recurring_expense_templates
  add constraint recurring_expense_templates_category_nao_vazio
  check (length(btrim(category)) > 0);

-- ---------------------------------------------------------------------
-- 4) RLS — mesma regra do financeiro (admin / financeiro).
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;

drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories for select
  using (fn_has_role(array['admin','financeiro']::user_role[]) and deleted_at is null);

drop policy if exists expense_categories_insert on public.expense_categories;
create policy expense_categories_insert on public.expense_categories for insert
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

drop policy if exists expense_categories_update on public.expense_categories;
create policy expense_categories_update on public.expense_categories for update
  using (fn_has_role(array['admin','financeiro']::user_role[]))
  with check (fn_has_role(array['admin','financeiro']::user_role[]));

revoke delete on public.expense_categories from authenticated, anon;

-- ---------------------------------------------------------------------
-- 5) RPCs — criar/editar e desativar (o DELETE é bloqueado; usa deleted_at).
-- ---------------------------------------------------------------------
create or replace function public.rpc_upsert_expense_category(
  p_slug text, p_label text, p_grupo text default 'Estrutura',
  p_kind text default 'gestao', p_icon text default null, p_sort_order int default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_id uuid; v_slug text;
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if coalesce(btrim(p_label), '') = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o nome da categoria.');
  end if;
  -- slug: usa o informado ou deriva do rótulo (minúsculas, sem acento, _)
  v_slug := lower(regexp_replace(
    translate(coalesce(nullif(btrim(p_slug), ''), p_label),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-zA-Z0-9]+', '_', 'g'));
  v_slug := btrim(v_slug, '_');
  if v_slug = '' then v_slug := 'cat_' || substr(gen_random_uuid()::text, 1, 8); end if;

  insert into expense_categories (slug, label, grupo, kind, icon, sort_order, created_by, updated_by)
  values (v_slug, btrim(p_label), coalesce(nullif(btrim(p_grupo), ''), 'Estrutura'),
          coalesce(p_kind, 'gestao'), p_icon, coalesce(p_sort_order, 100), auth.uid(), auth.uid())
  on conflict (slug) where deleted_at is null do update
    set label = excluded.label, grupo = excluded.grupo, kind = excluded.kind,
        icon = coalesce(excluded.icon, expense_categories.icon),
        sort_order = coalesce(excluded.sort_order, expense_categories.sort_order),
        active = true, updated_by = auth.uid()
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id, 'slug', v_slug);
end;
$$;
revoke execute on function public.rpc_upsert_expense_category(text,text,text,text,text,int) from public, anon;
grant  execute on function public.rpc_upsert_expense_category(text,text,text,text,text,int) to authenticated, service_role;

create or replace function public.rpc_soft_delete_expense_category(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_slug text; v_em_uso int;
begin
  if not fn_has_role(array['admin','financeiro']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  select slug into v_slug from expense_categories where id = p_id and deleted_at is null;
  if v_slug is null then
    return jsonb_build_object('success', false, 'message', 'Categoria não encontrada.');
  end if;
  -- não deixa remover categoria com custo recorrente ativo apontando pra ela
  select count(*) into v_em_uso from recurring_expense_templates
   where category = v_slug and deleted_at is null and active;
  if v_em_uso > 0 then
    return jsonb_build_object('success', false,
      'message', format('Há %s custo(s) recorrente(s) usando esta categoria — mova ou desative antes.', v_em_uso));
  end if;
  update expense_categories set deleted_at = now(), active = false, updated_by = auth.uid()
   where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.rpc_soft_delete_expense_category(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_expense_category(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) Realtime.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.expense_categories;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select slug, label, grupo, kind from expense_categories order by kind, sort_order;
--   select public.rpc_upsert_expense_category('','Combustível de reserva','Veículo','despesa');
