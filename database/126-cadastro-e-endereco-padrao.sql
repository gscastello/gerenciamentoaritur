-- 126-cadastro-e-endereco-padrao.sql — issue #474
--
-- 1) Passageiros → Cadastro → Editar dava "sem permissão": a edição grava telefone secundário, ponto
--    e pagamento padrão, mas a trava de colunas (database/12) só deixava o app alterar nome, telefone,
--    notas e bairro — e uma coluna sem permissão recusa o UPDATE inteiro. São dados de cadastro (não
--    mexem em dinheiro, vaga nem vínculo), então entram na lista. O RLS continua: só admin/atendente.
-- 2) "Tornar endereço padrão" ao agendar ou editar uma reserva: rpc_tornar_endereco_padrao copia o
--    embarque e o desembarque da reserva para o endereço de costume do passageiro no sentido dela,
--    pela mesma regra de rpc_definir_endereco_de_costume (database/66 e 95).

grant update (phone_secondary, default_route_point_code, default_payment_method)
  on public.customers to authenticated;

-- trava: a edição do cadastro (customersService.updateProfile) não pode voltar a falhar por coluna
do $$
declare v_falta text;
begin
  select string_agg(c, ', ') into v_falta
    from unnest(array['name', 'phone', 'phone_secondary', 'default_route_point_code', 'default_payment_method', 'notes', 'updated_by']) c
   where not exists (select 1 from information_schema.column_privileges p
                      where p.grantee = 'authenticated' and p.privilege_type = 'UPDATE'
                        and p.table_schema = 'public' and p.table_name = 'customers' and p.column_name = c);
  if v_falta is not null then
    raise exception 'customers: o app não consegue alterar %', v_falta;
  end if;
end $$;

create or replace function public.rpc_tornar_endereco_padrao(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_detalhe text;
begin
  if not coalesce(fn_has_role(array['admin', 'atendente']::user_role[]), false) then
    return jsonb_build_object('success', false, 'message', 'Sem permissão.');
  end if;
  select res.customer_id, t.direction, rp.code as ponto, res.pickup_neighborhood, res.pickup_detail,
         res.street, res.reference_point, res.dropoff_location, res.dropoff_area
    into r
    from reservations res
    join trips t on t.id = res.trip_id
    left join route_points rp on rp.id = res.route_point_id
   where res.id = p_reservation_id and res.deleted_at is null;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada.');
  end if;
  if r.customer_id is null then
    return jsonb_build_object('success', false, 'message', 'A reserva não tem cadastro de passageiro.');
  end if;
  -- rua, referência e anotação juntas, sem repetir o que já está igual
  v_detalhe := nullif(concat_ws(', ',
                 nullif(btrim(r.street), ''),
                 nullif(btrim(r.reference_point), ''),
                 case when btrim(coalesce(r.pickup_detail, '')) in ('', btrim(coalesce(r.street, '')), btrim(coalesce(r.reference_point, '')))
                      then null else btrim(r.pickup_detail) end), '');
  return rpc_definir_endereco_de_costume(r.customer_id, r.direction, r.ponto, r.pickup_neighborhood, v_detalhe,
                                         r.dropoff_location, r.dropoff_area);
end;
$function$;
revoke all on function public.rpc_tornar_endereco_padrao(uuid) from public, anon;
grant execute on function public.rpc_tornar_endereco_padrao(uuid) to authenticated;
