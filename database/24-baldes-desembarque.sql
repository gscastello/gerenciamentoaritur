-- =====================================================================
-- ROTA PIRAPEMAS — 24: BALDES DE DESEMBARQUE EDITÁVEIS (Sistema)
-- =====================================================================
-- Os "baldes" de desembarque (Cantanhede, Pirapemas, BR, Retorno, Casa…)
-- organizam a rota do motorista (database/10-dropoff-plan.sql) e o passo
-- "Onde você vai ficar" da tela Reservar. Eram fixos no frontend (App.jsx
-- DESEMBARQUE_IDA/VOLTA + DETALHE_DESEMBARQUE).
--
-- Esta migração cria `dropoff_areas` — rótulo, campo de detalhe (label,
-- placeholder, obrigatório) e ordem, tudo editável pela aba Sistema. O
-- `code` é estável (é o que vai em reservations.dropoff_area); a inferência
-- automática por palavra-chave continua nos codes conhecidos, uma área
-- nova só não é adivinhada sozinha (a classificação manual prevalece).
--
-- Rodar depois de 01-23. Idempotente.
-- =====================================================================

create table if not exists public.dropoff_areas (
  id                 uuid primary key default gen_random_uuid(),
  direction          text not null check (direction in ('ida', 'volta')),
  code               text not null,
  label              text not null,
  detail_label       text not null default 'Ponto de referência',
  detail_placeholder text not null default '',
  detail_required    boolean not null default false,
  sort_order         int not null default 100,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.users(id),
  updated_by         uuid references public.users(id),
  deleted_at         timestamptz
);
create unique index if not exists uq_dropoff_areas_dir_code
  on public.dropoff_areas (direction, code) where deleted_at is null;

drop trigger if exists trg_dropoff_areas_updated_at on public.dropoff_areas;
create trigger trg_dropoff_areas_updated_at before update on public.dropoff_areas
  for each row execute function public.fn_set_updated_at();

insert into public.dropoff_areas (direction, code, label, detail_label, detail_placeholder, detail_required, sort_order) values
  ('ida',   'cantanhede', 'Cantanhede',                'Onde em Cantanhede',           'Rua / ponto de referência', false, 10),
  ('ida',   'pirapemas',  'Pirapemas',                 'Onde em Pirapemas',            'Rua / ponto de referência', false, 20),
  ('ida',   'outro',      'Outros locais',             'Onde você vai ficar',          'Descreva o local',          true,  30),
  ('volta', 'br',         'BR (ponto de referência)',  'Ponto de referência na BR',    'Km, o que tem por perto',   true,  10),
  ('volta', 'retorno',    'Retorno',                   'Ponto de referência (opcional)', '',                        false, 20),
  ('volta', 'rodoviaria', 'Rodoviária',                'Ponto de referência (opcional)', '',                        false, 30),
  ('volta', 'casa',       'Em casa (bairro)',          'Bairro onde vai ficar',        'Ex.: Cohama',               true,  40)
on conflict (direction, code) where deleted_at is null do nothing;

alter table public.dropoff_areas enable row level security;
drop policy if exists dropoff_areas_select on public.dropoff_areas;
create policy dropoff_areas_select on public.dropoff_areas for select
  using (deleted_at is null);
drop policy if exists dropoff_areas_admin_write on public.dropoff_areas;
create policy dropoff_areas_admin_write on public.dropoff_areas for insert
  with check (fn_has_role(array['admin']::user_role[]));
drop policy if exists dropoff_areas_admin_update on public.dropoff_areas;
create policy dropoff_areas_admin_update on public.dropoff_areas for update
  using (fn_has_role(array['admin']::user_role[]))
  with check (fn_has_role(array['admin']::user_role[]));
revoke delete on public.dropoff_areas from authenticated, anon;

create or replace function public.rpc_upsert_dropoff_area(
  p_direction text, p_code text, p_label text,
  p_detail_label text default null, p_detail_placeholder text default null,
  p_detail_required boolean default null, p_sort_order int default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid; v_code text;
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  if p_direction not in ('ida', 'volta') then
    return jsonb_build_object('success', false, 'message', 'Direção inválida.');
  end if;
  if coalesce(btrim(p_label), '') = '' then
    return jsonb_build_object('success', false, 'message', 'Informe o nome do local.');
  end if;
  v_code := lower(regexp_replace(
    translate(coalesce(nullif(btrim(p_code), ''), p_label),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-zA-Z0-9]+', '_', 'g'));
  v_code := btrim(v_code, '_');
  if v_code = '' then v_code := 'area_' || substr(gen_random_uuid()::text, 1, 8); end if;

  insert into dropoff_areas (direction, code, label, detail_label, detail_placeholder, detail_required, sort_order, created_by, updated_by)
  values (p_direction, v_code, btrim(p_label),
          coalesce(nullif(btrim(p_detail_label), ''), 'Ponto de referência'),
          coalesce(p_detail_placeholder, ''), coalesce(p_detail_required, false),
          coalesce(p_sort_order, 100), auth.uid(), auth.uid())
  on conflict (direction, code) where deleted_at is null do update
    set label = excluded.label, detail_label = excluded.detail_label,
        detail_placeholder = excluded.detail_placeholder,
        detail_required = coalesce(excluded.detail_required, dropoff_areas.detail_required),
        sort_order = coalesce(excluded.sort_order, dropoff_areas.sort_order),
        active = true, updated_by = auth.uid()
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id, 'code', v_code);
end;
$fn$;
revoke execute on function public.rpc_upsert_dropoff_area(text,text,text,text,text,boolean,int) from public, anon;
grant  execute on function public.rpc_upsert_dropoff_area(text,text,text,text,text,boolean,int) to authenticated, service_role;

create or replace function public.rpc_soft_delete_dropoff_area(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not fn_has_role(array['admin']::user_role[]) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  update dropoff_areas set deleted_at = now(), active = false, updated_by = auth.uid()
   where id = p_id and deleted_at is null;
  return jsonb_build_object('success', true);
end;
$fn$;
revoke execute on function public.rpc_soft_delete_dropoff_area(uuid) from public, anon;
grant  execute on function public.rpc_soft_delete_dropoff_area(uuid) to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.dropoff_areas;
exception when duplicate_object then null;
end $$;

-- Conferir:
--   select direction, code, label, detail_required, sort_order from dropoff_areas order by direction, sort_order;
