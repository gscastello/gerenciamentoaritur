-- 127-revisao-de-dia-ou-sentido.sql — issue #476
--
-- O revisor achou o dia errado de uma reserva (certeza alta) e abriu "Revisão: conferir reserva" na
-- fila comum; ela foi fechada sem corrigir e a passageira não estava na lista da viagem. Agora o erro
-- de DIA ou SENTIDO, com certeza alta, numa viagem até 7 dias abre "Revisão: dia ou sentido errado",
-- que aparece na faixa vermelha da Agenda (domain/agendadoSemReserva.js).
--
-- As regras que fecham sozinhas a pendência do revisor (database/123: vencida em 3 dias; database/124:
-- revisor conferiu de novo, substituída por outra mais nova, sem viagem futura) passam a valer para as
-- duas: troca a comparação exata do assunto por "Revisão: %" nas duas funções.

do $$
declare
  v_fn text;
  v_def text;
begin
  foreach v_fn in array array['public.fn_fechar_pendencias_resolvidas()', 'public.fn_fechar_pendencias_vencidas()'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    if position('= ''Revisão: conferir reserva''' in v_def) = 0 then
      raise exception '%: não achei o assunto da revisão para trocar', v_fn;
    end if;
    execute replace(v_def, '= ''Revisão: conferir reserva''', 'like ''Revisão: %''');
    -- trava: nenhuma comparação exata sobrou
    if position('= ''Revisão: conferir reserva''' in pg_get_functiondef(v_fn::regprocedure)) > 0 then
      raise exception '%: ainda compara só "Revisão: conferir reserva"', v_fn;
    end if;
  end loop;
end $$;
