# Operação, frota e números (AGENTS.md §9)

> Parte do `AGENTS.md` (issue #496): mesmas regras, mesma força. Separada para não entrar em
> toda conversa. Leia inteira antes de mexer no assunto; regra nova do assunto entra aqui.

## 9. Operação, frota e números

- O **Início** mostra a capa, o faturamento e o lucro (ano, mês e hoje), os passageiros da Ida e da Volta e "Precisa
  de você". Os gráficos de 7 dias (Recharts), a IA operacional e a previsão de demanda saíram a pedido do dono (issue
  #428); os avisos de frota e vencimentos seguem no sino e em Pendências.
- **Passageiros (CRM)** (issue #436): o cartão aberto mostra o **histórico de viagens** com a data (dia da semana),
  Ida/Volta, embarque → desembarque, passagens, valor e situação; as próximas primeiro, depois as anteriores da mais
  recente para a mais antiga (`domain/historicoDoPassageiro.js`), as 10 primeiras e "Ver todas".
  A **ficha do passageiro** (issue #438, `FichaDoPassageiro.jsx`, `usePassageiro`) abre numa tela própria (celular:
  tela inteira; computador: painel), com abas **Viagens**, **Endereços** (mais usados + costume) e **Cadastro** (notas,
  editar, remover); a lista só serve para achar. Pela **Agenda**: "⋯" da reserva → **Ver passageiro** abre a mesma
  ficha por cima (só admin, atendente e financeiro; o motorista não vê).
- **Frota** (issue #369, `database/103`): consumo fora do normal = km/l abaixo de 85% da mediana dos 8 abastecimentos
  anteriores do veículo (sem litros: custo por km acima de 120%; menos de 3 anteriores não avisa). Regra única em
  `domain/frota.js` (tela Operação) e no trigger de `fuel_records` (aviso `consumo` no sino). Manutenção a 80% do
  intervalo de km vai para Pendências e para o sino (`manutencao`); documentos e licenças são vencimentos (#366).
- **Veículo de cada viagem** (issue #408, `database/108`): cada viagem guarda o veículo e os lugares (ônibus 31, van
  reserva 15). Na Operação, tocar no veículo pede o **dia e o sentido** em que ele roda (`rpc_veiculo_da_viagem`, só
  admin; recusa se a viagem já tem mais passageiros do que o veículo leva). O veículo padrão só vale para as viagens
  criadas daqui em diante, e trocá-lo pede confirmação. Agenda, Início e Nova reserva usam os lugares da viagem do dia
  (`capacidadeDaViagem`), nunca os do veículo padrão.
- **Extrato do banco** (issue #364, aba Gestão → Extrato, `database/104`): o dono manda o OFX/CSV do mês; cada
  movimento é guardado UMA vez em `extrato_linhas` (chave = id do banco ou data+valor+descrição+ordem) e a conferência
  (`domain/extrato.js`) separa: bate (mesmo valor, ±3 dias), pagamento de reserva já pago no Pix/cartão, **Pix dentro
  da receita lançada como total do dia** (não lançar de novo), falta lançar, em dobro e lançado no app fora do banco.
  "Lançar" passa por `rpc_lancar_movimento` (o lançamento sai do próprio movimento; dois toques não lançam duas vezes);
  o que não é da empresa fica "ignorado", nunca apagado.
- **Fechamento do mês** (issue #365, aba Gestão → Fechamento, `database/105`): `rpc_fechamento_do_mes('AAAA-MM')` =
  `rpc_numeros_do_financeiro` do mês + todos os lançamentos (com a foto da nota, quando lançada pela foto), pagamentos
  e contas quitadas; `domain/fechamentoDoMes.js` monta o DRE (com o DAS estimado de `simplesNacional.js`) e os avisos
  (cobertura das reservas, meses sem receita no DAS, despesa sem nota). Baixa em PDF, planilha e .zip das fotos; todo
  dia 1 às 08:00 o sino avisa (`fechamento`, só admin/financeiro veem).
- **Poucas vagas e dia sem ônibus** (dono, 23/11 — issue #497): clientes recorrentes têm prioridade; a equipe pode passar
  os outros para outra van por logística (cancelamento no app que não é erro). Sem o ônibus, o veículo do dia é
  **Van + carro** (19 lugares, Operação); abastecimento e manutenção vão na Van reserva.
- **Veículo do dia e vendas** (issue #502, `database/132`, etapa 1 da autonomia): a faixa no topo pergunta qual veículo
  roda (amanhã a partir das 14h; hoje enquanto não saiu) e um toque confirma (`rpc_confirmar_veiculo`, admin e atendente).
  Sem confirmação, o **bot sozinho** só vende até `settings.bot_autonomia.lugares_sem_confirmacao` (19); em Operação,
  "Fechar vendas" zera o que ele pode vender naquela viagem. A trava é no banco (`trg_reservations_autonomia`,
  `fn_vagas_para_o_bot`); a equipe e o "Agendado ☑️" não mudam.
