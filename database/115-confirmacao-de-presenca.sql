-- 115 — Confirmar a viagem na véspera e "saímos em rota" (issue #434)
--
-- avisos_passageiros ganha o TIPO do aviso (horario | confirmacao | em_rota). A resposta do
-- passageiro ao "você confirma a viagem?" fica na reserva (extra_data.presenca = {resposta, em,
-- texto}); NÃO abre uma pendência para a equipe liberar a vaga — o bot nunca cancela sozinho.

alter table public.avisos_passageiros
  add column if not exists tipo text not null default 'horario'
  check (tipo in ('horario', 'confirmacao', 'em_rota'));

create or replace function public.fn_registrar_presenca(p_reservation_id uuid, p_resposta text, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if p_resposta not in ('sim', 'nao') then
    return jsonb_build_object('success', false, 'message', 'resposta inválida');
  end if;
  select res.id, res.customer_id, res.status, t.trip_date, t.direction, c.name, c.phone
    into r
    from reservations res
    join trips t on t.id = res.trip_id
    left join customers c on c.id = res.customer_id
   where res.id = p_reservation_id and res.deleted_at is null;
  if not found or r.status not in ('confirmada', 'pendente') then
    return jsonb_build_object('success', false, 'message', 'reserva não está ativa');
  end if;

  update reservations
     set extra_data = coalesce(extra_data, '{}'::jsonb)
           || jsonb_build_object('presenca', jsonb_build_object('resposta', p_resposta, 'em', now(), 'texto', left(coalesce(p_texto, ''), 200)))
   where id = p_reservation_id;

  if p_resposta = 'nao' then
    perform rpc_open_support_ticket(
      'Passageiro disse que não vai viajar',
      format('%s respondeu NÃO ao pedido de confirmação da %s de %s ("%s"). Libere a vaga se for o caso.',
             coalesce(nullif(r.name, ''), 'O passageiro'),
             case when r.direction::text = 'ida' then 'Ida' else 'Volta' end,
             to_char(r.trip_date, 'DD/MM'),
             left(coalesce(p_texto, ''), 120)),
      r.phone, r.customer_id, 'whatsapp',
      jsonb_build_object('reservation_id', p_reservation_id, 'tipo', 'presenca_nao'));
  end if;
  return jsonb_build_object('success', true, 'resposta', p_resposta);
end $$;

revoke all on function public.fn_registrar_presenca(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_registrar_presenca(uuid, text, text) to service_role;
