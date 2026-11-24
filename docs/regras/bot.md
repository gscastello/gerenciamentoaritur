# Bot, IA e atendimento (AGENTS.md §8)

> Parte do `AGENTS.md` (issue #496): mesmas regras, mesma força. Separada para não entrar em
> toda conversa. Leia inteira antes de mexer no assunto; regra nova do assunto entra aqui.

## 8. Flexibilidade IA ⇄ humano

O número de WhatsApp está no **Chatwoot Cloud** (Coexistência com o app do
celular); o bot é um Agent Bot (`chatwoot-bot`). Operação em `WHATSAPP.md`.

- Modo global em `settings.attendance_mode` (`ia` | `manual` | `sombra`),
  editável na aba Sistema e válido na hora para todos os sócios:
  - `ia` — o bot responde e confirma reservas sozinho;
  - `manual` — o bot não responde; a conversa aparece como Aberta no Chatwoot; só lê a conversa para reservar
    quando a equipe escreve **"Agendado ☑️"** (não prepara reserva a cada mensagem — issue #278);
  - `sombra` — o bot **só observa e aprende** (issue #278): não gera resposta nem reserva
    preparada, que é o que custa. Registro de mensagem e comprovante continuam, e o **"Agendado ☑️" da equipe lança a
    reserva normalmente** (dono, 10/11). Aprende com o atendente **e com os
    clientes**: o que eles contam (lugares e referências, localidades, necessidades, épocas e motivos de viagem,
    dúvidas e reclamações) vira lição `dito_pelo_cliente`, que serve para entender e confirmar e nunca vira preço,
    valor, horário ou regra.
  - **Teste sob demanda, em qualquer modo:** nota privada `#testar` no Chatwoot (com ou sem uma
    pergunta depois) faz o bot escrever numa nota `🧪 [TESTE]` o que responderia; nada vai ao
    cliente, nada é gravado e a nota não entra no histórico nem no aprendizado. Todo bot novo ou
    mudança grande é testado assim antes de ligar o `ia`.
- Por conversa: `whatsapp_conversations.attendance_mode` (`ia` | `humano`). O bot
  **continua ativo** quando a equipe responde pelo celular; só **cala** na
  transferência completa (`rpc_transfer_to_human` + status Aberta no Chatwoot).
  Devolver ao bot = status Pendente no Chatwoot.
- O botão/pedido "falar com atendente" funciona em qualquer modo e **sempre**
  transfere e abre uma pendência (aba Pendências) com o link da conversa.
- **Cidades intermediárias são válidas** (issue #326, dono 11/11): Campestre, Matões, Miranda, Entroncamento,
  Colombo, Santa Rita e Bacabeira valem como embarque e desembarque. Trecho de **R$ 50 ou mais** (São Luís–Matões,
  Pirapemas–Bacabeira) é reserva normal; **abaixo de R$ 50** só fica `pendente` em dia cheio (sobram menos de 10
  vagas depois da reserva), para não faltar lugar a quem vai até São Luís (`trechoPrecisaDeConfirmacao`, ajustável em
  `settings.intermediate_review` = `{valor_minimo, vagas_minimas}`). Volta com embarque numa cidade do caminho = ponto
  Cantanhede com a cidade no embarque e o valor do trecho; Campestre vai no ponto Pirapemas, com o valor de Pirapemas/Cantanhede. Trecho sem
  valor na tabela continua indo para a equipe; cidade fora da rota também. **O sentido sai da ordem das paradas** (dono, 14/11 — issues #406 e
  #407): Ida = São Luís → Bacabeira → Santa Rita → Entroncamento → Miranda → Matões → Cantanhede → Campestre → Pirapemas;
  Volta = o contrário. Destino depois da origem = Ida, antes = Volta: de Pirapemas pra Cantanhede é Volta, de Cantanhede
  pra Pirapemas é Ida (ponto Outros). Vale o trecho escrito pelo cliente ou dito pela equipe e confirmado por ele
  (`ORDEM_DA_IDA`, `origemDoPedido`, `pedidosPelaOrigem`). **Rua com nome de cidade é rua** (issue #341,
  `semLogradouros` em `grafia.ts`): "Rua Santa Rita de Cássia", "Av. Colombo" não são as cidades do caminho.
  **Mesma viagem, uma reserva** (issue #345, `juntarPedidosDaMesmaViagem`): N passagens do mesmo passageiro no mesmo
  dia e sentido, mesmo com desembarques diferentes ("2 ficam no Santo Antônio e 2 na Estrada da Maioba"), são UMA
  reserva de N com os desembarques juntos. Apartamento/bloco/casa mandados depois só completam o endereço
  (`ehComplementoDoEndereco`); condomínio/residencial vai com o bairro no campo bairro. Frase de costume ("eu e minhas
  filhas viajamos sempre com vocês") não muda a quantidade.
- **Bairro sem preço** (issue #330, `database/96`): a tabela de bairros de São Luís foi completada pelo OpenStreetMap
  e pelas reservas, com o preço vazio até o dono preencher. Preço vazio **nunca vira R$ 0**: o bot devolve
  `BAIRRO_SEM_PRECO` (não diz valor; no Agendado fica "valor a confirmar") e o app mostra o campo vazio no topo de
  Sistema → Bairros. Nomes de cidades da rota (Matões, "Residencial Pirapemas") não entram como bairro. **Trechos da BR
  não são busca em casa** (issue #418, `database/110`, `localDeOutros`): Estiva, Pedrinhas, Oleama, Maracanã, Vila Itamar… estão
  em Sistema → Locais em Outros; ali o cliente espera na BR e a van para. Busca em casa num desses locais vira Outros (BR).
  **Posto Carone é ponto próprio** (dono, 22/11 — issue #486, `database/130`): volta a ser a categoria `postocarone`
  da Ida, com o horário dele em Sistema (05:40; na segunda, 04:40), e não fica mais em Outros, onde a mensagem dizia o
  horário de Outros. "Outros · Posto Carone" vira o ponto **no código** (`ehPostoCarone`): as instruções do
  leitor continuam dizendo "outro", porque trocar essa frase piorou leituras que nem falam do posto (issue #491).
- **Atendente de IA conversacional** (issue #224, `WHATSAPP.md §6c`): o Claude lê a conversa
  inteira e **consulta o app por ferramentas** (vagas, status da viagem, pontos, preços, reservas
  e pagamentos do próprio cliente); não há menu numerado. Ele **pode informar** vaga, preço e
  horário **desde que lidos do app na hora**: número que não vem de uma ferramenta, da base de
  conhecimento (aba Sistema) ou da mensagem do cliente **barra** a resposta (`botGuard`). Preço e
  vaga continuam **decididos pelo banco** (o modelo nunca digita preço; o total sai de
  `calcular_valor`; `rpc_create_reservation` valida a capacidade). Pode **criar, remarcar e
  cancelar as reservas do próprio cliente** depois do "sim" dele; nunca expõe dados de outros
  passageiros e só afirma ter mexido numa reserva se a ferramenta deu certo. Encomenda/frete,
  reclamação, reembolso, negociação de preço, mais de 10 passagens e trajeto que ele não resolve
  vão para a equipe (`chamar_atendente`); encomenda **nunca** recebe valor. Depois que a equipe
  responde, o bot fica **10 min em silêncio**. `settings.bot_engine = 'roteiro'` volta ao motor
  antigo. O bot **nunca** cadastra cliente com o nome do perfil do WhatsApp (costuma ser apelido):
  pergunta o nome.
- **Cliente recorrente / endereço de costume** (issue #228, `WHATSAPP.md §6d`): por cliente e sentido, fixado pela
  equipe (Passageiros) ou o mais frequente no histórico (`rpc_endereco_de_costume`, regra única no banco). No app dá
  *Agendar Ida/Volta* com a nova reserva já preenchida; no bot é a ferramenta `endereco_de_costume`, que propõe o
  pedido pronto **sem citar valor** e só cria depois do "sim" do cliente. Nada disso decide preço, vaga ou data.
  **Pela reserva** (issue #474, `database/126`): em Agendar passagem e Editar reserva, a caixa "Tornar este o endereço
  padrão da Ida/Volta" copia o embarque e o desembarque da reserva para o costume do passageiro no sentido dela
  (`rpc_tornar_endereco_padrao`, mesma regra de `rpc_definir_endereco_de_costume`); a reserva salva mesmo se o padrão
  falhar, e a tela avisa. A edição do cadastro em Passageiros grava telefone secundário, ponto e pagamento padrão: essas
  colunas estão no grant por coluna de `customers` (trava na própria migração e teste `enderecoPadrao.test.js`). **Passageiro
  recorrente** (issue #416, `sentidoPeloHabito`): "guarde uma vaga pra mim amanhã" sem sentido dito → o sentido sai do
  hábito (já tem reserva no dia → o outro sentido; senão o oposto da última viagem; costume de um lado só → esse) e
  embarque/desembarque vêm do costume: o Agendado lança, sem pendência.
- **Preço da Volta pelo lugar onde deixamos o cliente** (issue #349, dono 12/11): na Ida o valor é o do lugar onde
  buscamos; na Volta, o do lugar onde DEIXAMOS o cliente em São Luís, com a mesma tabela da Ida — Rodoviária e Retorno
  pelo preço desses pontos, em casa pelo bairro, aeroporto/BR como Outros, cidade do caminho pelo trecho. Desembarque
  vago ("São Luís") fica no valor do ponto. Regra única: `comoCobrarAVolta` (bot) e `precoDaVolta` (app).
- **Criança** (issue #506, dito pela equipe aos clientes em 10, 16 e 17/11): até 5 anos vai no colo, sem passagem e sem
  vaga; a partir dos 6 paga inteira e ocupa vaga. Em código (`passagensComCrianca`): "2 adultos e uma criança" + "3 anos"
  = 2. Sem idade, com idades misturadas ou com passagens/lugar pedidos, vale a conferência de antes.
- **Preço por embarque e desembarque** (issue #239): `calcular_valor` e `criar_reserva` comparam os dois na tabela de
  trechos (`route_fares`, editada em Sistema), depois no ponto/bairro. Trecho em cidade intermediária sem valor vai para
  a equipe. **Bairros e trechos evoluem:** o que o atendente diz e o que a equipe repete nas reservas vira sugestão em
  `bot_price_suggestions`, mas só entra na tabela com a aprovação do dono. O bot nunca decide preço.
- **No ritmo do cliente** (issue #238): o bot não segue roteiro nem pede tudo de uma vez. Cumprimento recebe
  cumprimento, uma pergunta por mensagem, responde o que foi perguntado antes de retomar. O resumo com "Posso
  confirmar?" antes de gravar continua obrigatório. **Andamento da viagem** (issue #244): só a ESTIMATIVA pelo
  cronograma do dono (`andamento_da_viagem`, `CRONOGRAMA_PADRAO` ou `settings.trip_schedule`): confere a reserva, dá a
  janela do lugar do cliente e diz pelo horário se já estamos em rota. Nunca diz onde a van está; se o cliente insistir,
  envia o contato do motorista (`settings.driver_contact`, aba Sistema → Bot). Na segunda, só a ida sai mais cedo.
  Paradas e plataforma viram lições `operacao`.
- **Cidade da Volta e lugares das cidades** (issues #272 e #274): ruas e referências se repetem em Pirapemas e
  Cantanhede, então a cidade de embarque da Volta só vale se o cliente disse (ou é o endereço de costume); nunca sai do
  nome da rua. A base `cidade_lugares` (ruas, pontos de referência, "casa de fulano", povoados; OpenStreetMap + toda
  reserva de Volta confirmada, aprendendo sozinha e cruzando os lugares citados juntos) só gera **aviso** e ajuda o
  atendente a **confirmar** com o cliente (`onde_fica`). **Em São Luís** (issue #297) o mesmo mapeamento leva ao
  **bairro**: `sao_luis_lugares` aprende rua/condomínio/referência → bairro com cada busca em casa confirmada
  (`fn_bairro_pelo_endereco`). Ordem para achar o bairro: bairro da tabela escrito no endereço → memória confirmada
  (`bairro_aliases`) → lugares de São Luís → internet. Bairro escrito no endereço vence o chute do leitor (nome de duas
  palavras ou mais; "Rua do Turu" não troca bairro). O preço continua sendo o do bairro na tabela. **Nome próprio é nome próprio**
  (issue #301): na chave do lugar só Rua/Avenida saem; Beco, Travessa, Praça, Estrada, Alameda e Rodovia ficam ("Beco
  do Hospital" ≠ "Rua do Hospital" ≠ "Hospital"), e nome de rua não é achado dentro de outro logradouro. Só palavras de
  posição viram "perto de" ("descida/subida da…"; perto/atrás/em frente o separador já trata), valendo o lugar inteiro
  E o de perto. Travas (`raise exception`) nas migrações 91–92 impedem a volta. A cidade da Volta que o cliente escreveu
  em **qualquer** mensagem do pedido vale como dita; se o Agendado ia ficar pendente por falta de leitura (cidade,
  endereço, dia, sentido), o bot **relê com o modelo capaz** antes de desistir. **Tudo o que a reserva precisa é
  conferido no que o cliente escreveu** (issue #303, `pedidoDoCliente.ts`): sentido, dia (contando do dia de cada
  mensagem), quantidade, ponto, bairro e cidade. Vazio que o cliente escreveu → completa com aviso; o que contradiz →
  aviso para conferir (nunca troca sozinho) e, no Agendado, relê com o modelo capaz e, se ainda não bater, fica
  pendente com o motivo. A leitura pega até 60 mensagens do pedido com até 2.000 letras cada.
  **Conferência final** (issue #309, `conferenciaFinal`): com a reserva PRONTA, depois de todas as regras, dia,
  sentido, quantidade e cidade da Volta são comparados de novo com o que o cliente escreveu; não bate → o Agendado não
  lança calado (pendente `conferir`). Regra nova que mexe na reserva não precisa de trava própria: a final pega. **Quem tem os dados, lança** (issue #401): depois da releitura com o modelo capaz, divergência só de
  embarque/bairro vai como "Conferir" na reserva (e o cliente vê na confirmação), não trava; endereço dado com o bairro
  achado pelo sistema entra com o valor do bairro; duas viagens no mesmo sentido na mesma leitura são dois rascunhos
  ("uma de ida e outra de volta" vira a Volta com os endereços trocados); o que veio logo depois do Agendado antigo é
  do pedido antigo; o revisor que troca Ida↔Volta troca junto embarque e desembarque. Com **vários pedidos**, viagem no sentido que o cliente não
  escreveu (e sem falar em volta) também não passa (issue #351): "agendar de novo" = refazer a reserva cancelada.
  **Confirmação ao cliente** (issue #310, `confirmacaoAoCliente.ts`): depois que o Agendado lança, o bot manda ao
  cliente o resumo (sentido, dia, embarque, quantidade; **nunca valor** nem onde o passageiro desce — dono, 14/11, #403, nunca o nome do perfil) e pede o
  que faltou (endereço, dia da volta). Uma vez por reserva criada; desliga em `settings.agendado_confirmacao`
  (`{"ativo": false}`). É a única mensagem automática ao cliente fora do modo `ia`, autorizada pelo dono (11/11).
  **Próxima viagem e dúvida perguntada ao cliente** (issue #314): pedido lido como Ida de hoje depois que a Ida saiu,
  com a Volta ainda por sair, e embarque que é lugar conhecido de Pirapemas/Cantanhede → Volta de hoje; se o nome também
  é bairro de São Luís → pendente `qual_viagem`. Dúvida que só o cliente resolve (`qual_viagem`, `cidade`) o bot
  **pergunta ao cliente**, uma vez por dúvida (`support_tickets.meta.perguntas`); quando ele responde, a releitura do
  Agendado (janela de 4 h) lança e a pendência se resolve sozinha. Mesma chave da confirmação.
  **Cidade da Volta pelas pistas** (issue #324, `cidadeDaVoltaPelasPistas`): sem cidade dita, o Agendado cruza tudo o
  que o sistema sabe — Campestre (cidade do caminho, entre Pirapemas e Cantanhede: ponto Pirapemas, mesmo valor, sem
  revisão; `EMBARQUES_INTERMEDIARIOS_DA_VOLTA`), lugar que só existe numa cidade na base (qualquer número de reservas),
  cidades das reservas anteriores do cliente e cidade que ele cita em TODAS as conversas guardadas (`whatsapp_messages`).
  Todas apontam a mesma → vale, com aviso (e a confirmação ao cliente mostra a cidade); discordam → pergunta ao cliente.
  **Revisor de reservas** (issue #339, `database/97`, função `revisor-reservas`, `revisaoPura.ts`): a cada **minuto** (#410)
  (`pg_cron` → `pg_net`, chave da rotina no Vault, só o hash em `rotinas_chaves`) o bot revê cada passageiro com reserva
  futura em que algo mudou (`fn_clientes_para_revisar`: assinatura = reservas + última mensagem; reserva com menos de
  3 min espera o Agendado). O modelo capaz relê a conversa inteira e aponta erros (do bot, do cliente ou da equipe) com
  o trecho LITERAL da conversa; o código só corrige sozinho o que tem essa prova e certeza alta, nos campos dia,
  sentido, ponto, bairro, embarque, desembarque e quantidade; tipo, nome e o resto viram pendência. Preço nunca vem
  do modelo (zerado → tabela; valor do bot diferente da tabela → tabela; valor mudado à mão pela equipe fica).
  **O que uma pessoa mudou à mão (equipe ou Assistente) vence a conversa anterior** (issue #389, lido no `audit_logs`):
  o revisor não desfaz; só se o cliente escreveu depois da mudança vira pendência.
  **Correção na hora** (issue #410, `database/109`): reserva nova espera 1 min e cliente que ainda
  escreve espera 45 s sem mensagem nova; a marca `andamento` impede duas rodadas no mesmo passageiro. A equipe escreve
  **"Atualizado ☑️"** (ou Corrigido/Alterado/Remarcado com ☑️/✅) na conversa e o revisor corrige NA HORA, com a marca
  como confirmação: certeza média basta, inclusive para dia e sentido (`confirmadoPelaEquipe`). Sem reserva futura, vale
  como Agendado; nada a mudar vira pendência "Atualizado ☑️ não mudou nada".
  **Desistência do cliente** (dono, 22/11 — issue #490, `decidirCancelamentos`): em qualquer modo, o revisor cancela
  sozinho quando o CLIENTE desmarca com todas as letras, depois da reserva, com certeza alta, e a reserva é a única que
  a frase pode querer dizer; avisa o cliente (`mensagemDeCancelamento`, mesma chave da confirmação). Pergunta, mudança de
  dia, só uma de várias passagens, encomenda, reserva paga, cliente que voltou atrás, equipe que marcou ou mexeu depois →
  pendência, nunca cancela. Próxima etapa (lançar pedidos claros sem a marca) só depois do banco de casos.
  **Volta sem desembarque não é pendência** (dono, 23/11 — issue #497, `soFaltaDesembarqueDaVolta`): é São Luís. Só conta
  o lugar que o cliente escreveu e a reserva não tem.
  Duplicada do bot na mesma viagem → cancela a mais nova. Tudo auditado (`revisoes_reservas`, `audit_logs`,
  `extra_data.revisao`), o cliente recebe "atualizei sua reserva" (mesma chave da confirmação) e há teto mensal em
  `settings.revisao_budget` (US$ 40 por padrão). `{"simular": true}` no corpo revisa sem mudar nada. Viagem que já saiu não é revisada; **dia e sentido** só mudam sozinhos
  se a prova foi escrita **depois** da reserva (fala de pedido antigo pode ser de outra viagem: vira pendência), e o
  modelo recebe as viagens passadas do passageiro para não confundir pedidos. Correção que o cliente escreveu **depois** da reserva vale como confirmação
  (issue #343): em embarque, desembarque, ponto, bairro e quantidade basta certeza média com essa prova.
  **Resposta à pergunta da equipe** (issue #320): o que o cliente responde vale para o que a equipe perguntou —
  depois de "Te buscamos aonde?" é embarque (`desembarqueEraEmbarque` tira do desembarque); sugestão da equipe
  ("Na usina, certo?") respondida com "não" sai do embarque (`sugestoesRecusadas`).
- **Erros de escrita** (issue #276): cliente escreve "amnh", "hj", "sesta", "Catanhede", "listre caldas". O bot
  interpreta pelo sentido no contexto e confirma com a palavra certa; as comparações exatas usam a regra única de
  `_shared/grafia.ts` (igual a `fn_distancia_grafia` no banco): palavra por palavra, sem "da/de/do", até 3 letras tem
  de ser igual, 4–8 aceitam 1 erro, 9+ aceitam 2, no máximo 2 no total; empate não chuta. A base de lugares guarda
  as grafias erradas (`cidade_lugares_grafias`). Erro de escrita só ajuda a **reconhecer**: nunca decide preço, vaga
  ou cidade sozinho.
- A fila de atendimento fica na aba **Atendimento** (espelho do Chatwoot).
- **Assistente da equipe** (issue #288, aba **Assistente**, Edge Function `assistente`): a equipe pede como pede ao
  Claude Code (agendar lendo a conversa, remarcar, cancelar, pendências, vagas, preço, números do financeiro) pela
  chave da API, sem depender do plano do Claude. Age **com as permissões de quem está logado** (RLS e RPCs da Agenda;
  autoria = quem pediu) e **só propõe**: nada é gravado sem o toque em "Confirmar" no cartão, e o preço é recalculado
  no servidor pela tabela. Haiku 5.5 no simples, Sonnet 5.5 em números/explicações; uso por pedido em
  `assistente_uso` e teto mensal em `settings.assistant_budget` (US$). Não muda código, não publica, não manda
  mensagem ao cliente. **Números** (issue #367): uma conta só no banco, `rpc_numeros_do_financeiro(de, até)`
  (`database/102`, admin/financeiro) — resultado e margem por mês e categoria, por sentido, ticket médio, margem
  estimada por viagem (despesas rateadas pelas viagens que rodaram), custo por km e km/l, quem mais viaja, a receber e
  o período anterior; o fechamento do mês usa a mesma. **Sabe o que o Claude Code sabe** (issue #295): recebe os dados do sistema e a base de
  conhecimento (`montarFatos`), as lições aprovadas, o cronograma e `CONHECIMENTO_DA_OPERACAO` (as regras do `/agendar`);
  e faz, sempre como proposta, o que o dono pede aqui: confere os "Agendado ☑️", lança/descarta reservas prontas,
  resolve pendências, muda nome/telefone/valor do sócio/pagamento/pago, usa o endereço de costume. Regra nova de
  operação combinada com o dono entra também em `CONHECIMENTO_DA_OPERACAO`. **Pela Siri** (issue #290, `SIRI.md`, função `assistente-voz`): atalho do iPhone com uma
  chave pessoal (só o hash no banco; apagar desliga), respostas curtas para ler em voz alta e "sim" por voz para gravar.
  **Ensina o bot** (issue #318, `database/94`): o que o sócio informa ou corrige vira aprendizado, também só depois
  do "Confirmar"/"sim" — `propor_licao` → `rpc_ensinar_ao_bot` (lição em `bot_learnings`; admin = já aprovada) e
  `propor_lugar` → `rpc_ensinar_lugar` (lugar de Pirapemas/Cantanhede em `cidade_lugares`, fonte dono/equipe, vale
  como mapa; lugar de São Luís → bairro em `bairro_aliases` confirmado + `sao_luis_lugares`). Preço e telefone nunca
  entram em lição (o banco recusa). Correção de reserva pelo assistente já conta no Acerto do bot e ensina as bases
  de lugares pelos gatilhos das reservas.
  **Hábito de cada passageiro** (issue #328, `database/95`): `propor_costume` fixa o endereço de costume por sentido
  (ponto vazio = **embarque varia**: o bot não chuta o embarque, mas usa o desembarque de costume fixado) e
  `propor_instrucao_cliente` guarda em `customers.bot_instructions` o que a equipe ensinou sobre o passageiro (o que
  varia, o que perguntar). O aprendizado não mexe nas instruções (a anotação automática segue em `bot_customer_notes`);
  o leitor do Agendado, o atendimento automático e o assistente leem e seguem, valendo sobre o histórico.
- **Lançamento manual pelo Claude** (issue #253): a skill `/agendar` (`.claude/skills/agendar/`) lê a conversa
  no banco (ou a lista colada), confere cadastro, vagas, preço e duplicidade e cria pela `rpc_create_reservation`
  com o sócio que pediu como autor. Mesmas travas do bot: preço nunca inventado, encomenda sem valor, nada de
  nome do perfil do WhatsApp, nenhuma mensagem ao cliente sem o dono pedir.
- **Reservas preparadas pela IA** (issue #254, `WHATSAPP.md §6e`): quando a equipe atende, o bot lê a conversa e, com
  **data + endereço ou ponto**, deixa um rascunho em `reservation_drafts`. A equipe lança com um toque (preço e vaga
  pelo app); criar a reserva por qualquer caminho fecha o rascunho. A IA nunca reserva nem decide preço por aqui,
  **exceto** quando a equipe escreve **"Agendado ☑️"** na conversa (issue #257): a marca é a confirmação manual e a
  reserva preparada é lançada com o preço da tabela (mesma regra do bot) e a vaga validada pelo banco; se faltar algo,
  fica na lista com o motivo. **Agendado que não lançou não fica calado** (issue #455): nota privada na conversa ("esta reserva NÃO entrou na Agenda" + o motivo), faixa vermelha fixa no topo do app para quem agenda (`AvisoAgendadoSemReserva`, `domain/agendadoSemReserva.js`) e, quando alguém lança a reserva do passageiro, a pendência fecha sozinha (`database/120`). Vale em qualquer modo, **inclusive no sombra** (dono, 10/11). O Agendado **reserva como está** (dono, 10/11): sem endereço a
  vaga entra só com o nome, "Endereço a confirmar" e sem valor na Ida; Volta sem cidade usa a base de lugares ou o
  costume, senão fica pendente; "ida e volta" sem o dia da volta lança a Volta no mesmo dia marcada para confirmar. **"Hoje" dito pelo cliente nunca vira amanhã calado** (issue #307): se a viagem daquele sentido já saiu e o
  destino existe na do outro sentido (cidades do caminho, como Miranda), é a do outro sentido hoje; senão fica pendente.
  "Quero uma passagem para hoje" **sem sentido, embarque nem destino** depois que a viagem saiu é a outra de hoje
  **só com o "Agendado ☑️" da equipe** (quem marcou conhece o cliente) **ou com o hábito do cliente** (costume no outro
  sentido); o bot sozinho, nos outros casos, pergunta (dono, 13/11 — issue #387). E o **"Agendado ☑️" anterior fecha o pedido de antes**: o que veio antes dele (com mais de
  6 h até o pedido novo) só entra como histórico, nunca vira reserva de novo (`inicioDoPedidoAtual`). Quando o Agendado
  relê com o modelo capaz, **só lança o que a leitura final gravou** (`rascunhosDoAgendado`); rascunho que sobrou da
  primeira leitura vira pendência `nao_confirmado`, nunca reserva sem as travas. Quando
  o cliente informa depois (outro dia, endereço, cidade), o bot completa a reserva (`extra_data.a_confirmar`).
- **O bot aprende o tempo todo, em qualquer modo** (`ia`, `manual` ou `sombra`): é o treino
  para o modo automático futuro e **nunca deve estagnar** (issue #218, `WHATSAPP.md §6b`).
  Observa só texto (90 dias), gera lições sem nomes/telefones e uma anotação por cliente
  recorrente. **Aprende com o atendente e com os clientes** (o que o próprio bot escreveu não entra;
  o que o cliente conta vira `dito_pelo_cliente`, só para entender e confirmar — issue #278), em
  orientações gerais e casos isolados aplicáveis, nunca roteiro, menu ou formulário fixo; o que o
  dono retirou não volta sozinho (issue #232). Linguagem/estilo/fluxo/situação/operação valem na hora com
  aviso; fato e negócio (inclusive valor de trecho) só aprovados, e operação que cite dinheiro também. Lição já revisada nunca é
  reescrita sozinha: o bot deixa uma sugestão de atualização para o dono aceitar ou manter. Mudança no aprendizado não pode quebrar essas
  garantias (nem fazer o bot decidir preço, vaga, horário ou confirmação).
- **Acerto do bot** (issue #311, `database/93-acerto-do-bot.sql`, aba Sistema → Bot): `rpc_bot_acerto(p_dias)` lê o
  `audit_logs` das reservas lançadas pelo bot (usuário "Bot WhatsApp" ou `origem = agendado_equipe`) e separa o que
  outra pessoa **corrigiu** (mudou o que o bot gravou), **completou** (preencheu o que estava vazio/"a confirmar") e
  **cancelou**. Acerto = lançadas sem correção ÷ lançadas. É o número que decide quando ligar o modo `ia`; todo erro do
  bot vira um teste de regressão antes de ser corrigido.
- **Banco de casos reais e avaliação** (issue #419, `database/111`, função `avaliar-bot`, `avaliacaoPura.ts`): meta do
  dono **99,9%** — um erro faz o passageiro perder a viagem. Cada "Agendado ☑️" real vira um caso em `bot_casos`
  (`fn_gerar_casos_bot`): a conversa até a marca e as viagens que ficaram (cancelada em até 30 min = correção da equipe;
  depois disso, o passageiro desmarcou). `avaliar-bot` (chave da rotina do revisor, `{rodada, casos?, modelo?}`) refaz a
  leitura do Agendado como ela estava na marca, **sem gravar nada** (`simularAgendado`), e grava em `bot_avaliacoes`:
  certo / pendente (avisou a equipe ou perguntou) / faltou / errado. Caso conferido à mão: `verificado`, `observacao`;
  `pendente_ok` = o certo é perguntar (o cliente não escreveu o dia); `ativo = false` = fora da conta. **Nenhuma mudança
  no leitor do Agendado é publicada sem uma rodada nova sem erro novo**; todo erro relatado vira caso. Regras que saíram
  dos casos: busca em casa num endereço de Pirapemas/Cantanhede é Volta (escrito ou só conhecido lá; com algo de São
  Luís, pergunta `onde_embarca`); com várias viagens o trecho dito vale para a do dia dele; a viagem que desce onde a
  outra embarca é a Volta; Volta que embarca na BR de São Luís é Ida; ninguém escreveu o dia → sem dia e pergunta
  `sem_data` (com o "Agendado ☑️" no dia do pedido e a viagem daquele sentido ainda por sair, é a de hoje; já saiu, não vira amanhã: o bot pergunta o dia — issue #452, reafirmado pelo dono em 24/11: "o dia da viagem precisa estar definido com clareza"; caso 1a6a7143); "agendar de novo" refaz a reserva cancelada; lugar da cidade em Outros (Pátio Norte) é busca pelo bairro. **Pendências do Agendado** (dono, 23/11 — issue #504): o pedido feito
  DEPOIS da viagem anterior daquele sentido (ontem, depois da saída) com o Agendado hoje antes da viagem sair também é
  a de hoje; o endereço de onde ele sai no interior ("Cantanhede rua do cajueiro…", "aqui em Pirapemas";
  `embarqueNoInteriorEscrito`) é sentido escrito (Volta); a mensagem que o bot não leu não trava o dia que veio dessa
  regra (a equipe viu e marcou; aviso "Conferir dia"); "para hoje" sem sentido, com o Agendado, quando só uma viagem
  de hoje ainda sai, é essa; a correção do cliente ("marca só uma") vence a quantidade dita antes.
- **Prova do atendente de IA** (etapa 2 do bot autônomo — issue #501, `provaDoAtendente.ts`, `provaPura.ts`,
  `database/133`): `avaliar-bot` com `{"atendente": true, "rodada": "atendente-…"}` refaz cada caso de `bot_casos` com o
  ATENDENTE (modo `ia`) no lugar da equipe. As mensagens do cliente até a marca entram em turnos (seguidas, sem a equipe
  no meio e até 3 min entre elas; no máximo os 12 últimos); a cada turno ele lê o que o cliente escreveu e o que ELE
  respondeu antes, na hora do turno. **Nada é enviado nem gravado**: com `ctx.prova` as ferramentas anotam o que fariam
  (reserva, remarcar, cancelar, espera, avisar, chamar a equipe) e o contexto vai em sombra como segunda trava.
  Cadastro, reservas e endereço de costume são os de **antes** da conversa (`fn_endereco_de_costume(p_customer_id, p_antes_de)`;
  sem ela, nenhum costume) e sem a anotação do cliente, para não vazar a resposta. **Vagas da época**: os passageiros de
  reservas criadas depois do início da conversa saem da lotação de hoje. **O "sim" da prova**: na conversa real a equipe
  lançou sem pedir confirmação, então, se o atendente termina só pedindo a confirmação do resumo (`pedeConfirmacao`;
  pergunta de dado não conta), a prova responde "Sim, pode confirmar." pelo cliente, até 2 vezes, com o turno marcado
  `sintetico` — o que ele gravar é o que o resumo dizia. Resultado em `bot_avaliacoes`: certo; pendente
  (chamou a equipe, terminou perguntando, lista de espera, fora da área); faltou; **errado** = dia, sentido, ponto,
  quantidade, bairro, tipo ou **preço** diferente do que ficou, viagem não pedida, ou mexer numa reserva que já existia
  (para conferir). Respostas e ações de cada turno em `lido.turnos`/`lido.acoes`; custo em `tokens.custo_usd`
  (`custoMensal`: média por conversa × 82/dia × 30; teto do dono US$ 120/mês). Meta para a etapa 3: zero errado.
  **Atendente mais barato** (issue #504, depois do piloto que deu US$ 0,09–0,30 por conversa): Sonnet 5.5 (mesmo preço do
  Sonnet 5, leitura do cache pela metade) com esforço médio e fallback do servidor para recusa; instruções fixas com
  cache de **1 h** (entre conversas passam de 5 a 60 min) e a conversa com cache de 5 min dentro do turno (cada volta de
  ferramenta relia tudo); "ok"/"obrigado"/👍 depois de uma resposta SEM pergunta nem chama o modelo
  (`soCortesiaSemPergunta`; "ok" depois de pergunta, número, cumprimento e áudio vão para o modelo). Recusa sem reserva →
  a equipe assume. Toda mudança dessas passa pela prova antes de valer no `ia`.
  **O que é preciso para reservar** (dono, 23/11 — issue #504: "não deixar nenhum agendamento para trás"): só o
  ESSENCIAL trava a reserva do atendente — dia, sentido, onde embarca (na Volta, a cidade e a rua/referência; na busca
  em casa, o endereço ou o bairro), quantidade (não dita = 1, escrita no resumo) e o telefone da conversa. Nome, onde
  desce (cidade e lugar) e pagamento são COMPLEMENTARES: sem eles a reserva sai (preço do ponto, como a equipe cobra;
  `extra_data.complementar`) e o atendente pede o que falta numa pergunta, na mensagem que conta que reservou. Nome = o
  que o cliente escreveu, mesmo só o primeiro; nunca o do perfil do WhatsApp. Base: nos 14 dias até 23/11, 57% das
  reservas tinham nome de uma palavra, 47% das Voltas e 22% das Idas não tinham desembarque.
  **Valor só se o cliente perguntar** (dono, 23/11): o atendente não cita preço por conta própria, nem no resumo. A
  Volta espelha a Ida pelo DESEMBARQUE em São Luís: em casa pelo bairro; Retorno, Rodoviária, BR e Posto Carone pelo
  ponto; aeroporto o dele (`comoCobrarAVolta`). Cliente da Volta que pergunta o valor sem dizer onde desce: o atendente
  pergunta primeiro (`calcular_valor` devolve FALTA_DESEMBARQUE). Reserva da Volta sem desembarque entra com o valor do
  ponto e o revisor acerta pela tabela quando o desembarque chega (`conferirPreco`).
- **Camadas de segurança do agendamento** (análise do dono, 18/11 — issues #460 a #465):
  **Áudio e localização** (#460): a transcrição do áudio que o Chatwoot manda (`transcribed_text`) entra no texto como
  `[áudio: …]` (sem ela, `[áudio sem transcrição — ouça no WhatsApp]`, que conta como mensagem não lida) e a localização
  como `[localização: nome — link do mapa]` (`textoDosAnexos` em `chatwootPayload.ts`); a transcrição que chega depois
  atualiza a observação. **Transcrição ligada no Chatwoot** (dono, 19/11 — issue #470): o texto chega segundos depois
  (`message_updated`), então o áudio sem texto não é respondido na hora (`soAudioSemTranscricao`); a transcrição do
  cliente segue o caminho de uma mensagem de texto dele (resposta no `ia`, releitura do Agendado, reserva a confirmar,
  SIM/NÃO). Só se ela não vier em 40 s (`ESPERA_DA_TRANSCRICAO_MS`, modo `ia`) o bot pede para escrever. **Leitura com voto de maioria** (#465): o Agendado lê duas vezes em paralelo; concordam no que
  decide a reserva (tipo, dia, sentido, quantidade, ponto) → vale; discordam → terceira e vale a maioria; sem maioria →
  relê com o modelo capaz (`leituraDaMaioria`). Trocar só o modelo não resolve: a rodada com o Sonnet foi pior. **Cache
  das instruções** (issues #488 e #491, `partesDaLeitura`, `sistemaComCache`): as REGRAS da leitura e do revisor vão
  na frente com cache de 1 h; o resto vem depois, na MESMA ordem de sempre (pôr as listas antes do calendário piorou a
  leitura na avaliação). Nada que muda por conversa ou por hora entra na parte fixa;
  senão o cache não pega e o custo volta (confira `cache_lido` nos registros). **Leitura guardada na
  avaliação** (issue #494, `database/131`, `bot_leituras_memo`): mesmo texto = não chama o modelo, então mudança só de
  código é avaliada de graça e sem variação; mudou uma palavra das instruções, lê tudo de novo (`{"fresco": true}` força).
  Rodada completa = 1 caso por chamada, ondas de até 80; confira `feitos = ativos`. Diferença → repetir o caso 5 vezes na
  versão nova e na antiga antes de chamar de variação. **Regras de código do leitor** (#494): "mesmo endereço que me
  deixou hoje" = sentido contrário da última viagem (`viagemDeOndeDeixou`); "buscar em casa e deixar em Cantanhede" = Ida;
  "Cohatrac novo" = Novo Cohatrac (`bairroComoNaTabela`). A sentinela confere a conversa antes do modelo; o revisor
  não relê por cortesia nem por "ok" logo depois da confirmação (`fn_mensagem_sem_novidade`). Nome de
  parada escrito errado ("entrocamento") é corrigido antes de achar a origem (`paradasCorrigidas`). **IA fora do ar**
  (#462): Agendado que falhou por erro do serviço (`falhaDoServicoDaIa`) é tentado de novo pelo revisor, de 5 em 5 min,
  até 5 vezes em 6 h; chave recusada ou serviço caído abre UMA pendência "IA fora do ar", que fecha na próxima leitura
  que funcionar. **Sentinela de pedido sem reserva** (#461, função `sentinela-pedidos`, `sentinelaPura.ts`,
  `database/122`): de 10 em 10 min, conversa com pedido de vaga nas últimas 72 h, parada há 30 min e sem reserva lançada
  depois → simula o Agendado sem gravar; viagem de hoje a 3 dias que não saiu (ou pedido de reserva com todas as letras
  sem o dia) e sem "lotado"/"era só consulta" → pendência "Pedido sem reserva" + nota privada no Chatwoot. Fecha
  sozinha ao lançar a reserva do passageiro. Nada vai ao cliente. **Casos que crescem sozinhos** (#463,
  `database/123`): toda madrugada os Agendados novos viram casos e são avaliados na rodada `auto`; errado ou faltou vira
  a pendência "Bot errou em casos reais". **Fila enxuta** (#464): o revisor preenche sozinho embarque, desembarque ou
  bairro VAZIO com certeza média quando o valor está na própria prova (`campoVazio`, `valorNaProva`); "Revisão: conferir
  reserva" com mais de 3 dias e "Pedido sem reserva" com mais de 4 fecham como vencidas (`fn_fechar_pendencias_vencidas`). **Pendência resolvida fecha sozinha** (#467, `database/124`): de 10 em 10 min
  `fn_fechar_pendencias_resolvidas()` confere cada pendência aberta contra o app e fecha com o motivo em
  `meta.resolvida_por` — reserva lançada depois, viagem que passou, revisor que conferiu de novo sem achar nada,
  pendência do revisor substituída, diagnóstico que não existe mais ou repetido. A sentinela só avisa quando o cliente
  pediu para reservar com todas as letras ou escreveu onde embarca (`clienteConcretizou`); pergunta solta não.
  **Já resolvidas** (issue #472, `database/125`, `fn_fechar_pendencias_ja_resolvidas`): "Pedido sem reserva" fecha
  quando o passageiro tem reserva lançada depois do último PEDIDO dele (não da última mensagem: "Aguardando" não reabre),
  quando a conversa espera o cliente (`fn_conversa_aguarda_cliente`: a equipe pediu endereço/dia/nome ou ele disse que
  manda depois) e quando a viagem de hoje já saiu (Ida 08 h, Volta 15 h); "lançou só parte" fecha quando o revisor releu
  depois sem achar nada. A sentinela não simula essas conversas e revê as próprias pendências abertas a cada rodada;
  endereço picado numa pergunta de preço ("quanto é pra me deixar nesse endereço" / rua / "?") não é pedido.
  **Dia ou sentido errado** (issue #476, `database/127`): o revisor que acha erro de DIA ou SENTIDO com certeza alta
  numa viagem até 7 dias abre "Revisão: dia ou sentido errado" (`pendenciaDeDiaOuSentido`), que vai para a faixa
  vermelha ("Dia na Agenda 23/11, pedido 22/11"); as regras de fechamento das revisões valem para as duas. Tocar no
  passageiro da faixa abre a Pendências já na pendência dele, destacada. No leitor, o sentido que o cliente escreveu
  ("indo pra São Luís", inclusive em resposta ao "Ida ou Volta?" do bot) resolve a dúvida do lugar do embarque
  (`sentidoPeloLugarDoEmbarque`). No `/agendar`, data relativa é calculada no banco, com o dia da semana no relatório.
  **Dia dito pela equipe** (issue #478): a trava #417 (o cliente não escreveu o dia e mandou um áudio sem transcrição)
  não segura o "Agendado ☑️" quando a EQUIPE escreveu um único dia ("só teremos vaga pra amanhã") e a leitura deu esse
  dia (`diaDitoPelaEquipe`): lança com o aviso para conferir. Dois dias oferecidos, ou outro dia lido: pendente.
  **Transcrição parada** (issue #480, `database/128`): a transcrição gasta o crédito do Captain (Chatwoot → Cobrança,
  300 por mês, renova dia 26); acabou em 22/11 às 13 h. Com áudio do cliente sem transcrição nas últimas 72 h, o bot
  não pergunta nada ao cliente (`naoPerguntarPorAudioNaoLido`: a resposta pode estar no áudio, que a equipe ouviu) e a
  pendência fica para a equipe. 5+ áudios em 2 h sem nenhum transcrito abrem a pendência "Chatwoot não está
  transcrevendo os áudios" (`fn_avisar_transcricao_parada`, 10 em 10 min), que fecha sozinha quando volta.
  **Transcrição própria** (issue #482, `_shared/transcricao.ts`, secret `OPENAI_API_KEY` cadastrado pelo dono em 22/11):
  o Claude não ouve áudio. Áudio sem texto 12 s depois de chegar → o bot baixa (só de `*.chatwoot.com`) e transcreve
  na OpenAI (`gpt-4o-mini-transcribe`, ~US$ 0,003/min; `TRANSCRICAO_MODELO` troca). As ruas da base vão junto como vocabulário
  (`contextoDaTranscricao`, issue #499: "Eurico Ribeiro" virava "Rio Cur Ribeiro"). O texto segue o caminho da
  transcrição do Chatwoot (observação trocada no lugar; do cliente, passa pelo que uma mensagem de texto passa); a do
  Chatwoot que chegar depois não vira "editada" (`transcricaoRepetida`). **O Chatwoot não deixa o Agent Bot listar
  mensagens** (401 "not authorized for bots"): a leitura do Agendado usa o histórico do banco, onde a transcrição entra.
  Áudios antigos sem texto: `sentinela-pedidos` com `{"transcrever": <conversa>, "mensagens": [...]}` (a lista vem da
  sessão de quem está no Chatwoot).
- **Avisar passageiros** (issue #432, Agenda → "Avisar passageiros", só admin/atendente; Edge Function
  `avisar-passageiros`, `avisoPuro.ts`, `domain/avisoAosPassageiros.js`, `database/114`): a mensagem de cada passageiro
  com o horário do ponto DELE (os da Agenda: `route_points.base_time` + a Ida da segunda mais cedo), texto editável,
  nada sai sem "Enviar" + "Confirmar". Dentro das 24 h da última mensagem do cliente vai o texto; fora, só o **modelo
  aprovado pela Meta** em `settings.aviso_modelo` (`{"nome","idioma","categoria"}`; variáveis {{1}} nome, {{2}} dia,
  {{3}} ponto, {{4}} horário). Sem modelo ou sem conversa, o passageiro vai para "Avisar pelo celular". Tudo em
  `avisos_passageiros`; quem já recebeu volta desmarcado. A confirmação do Agendado também traz o horário do ponto.
  **Tipos** (issue #434, `database/115`): Horário, **Confirmar viagem** (SIM/NÃO; a resposta clara até 36 h depois vai
  para `extra_data.presenca` pela `fn_registrar_presenca` e aparece na Agenda — NÃO abre pendência para liberar a vaga,
  o bot nunca cancela; o bot responde só um obrigado) e **Em rota** ("já estamos em rota buscando os passageiros,
  aguarde no seu local de embarque"). Mensagens curtas, a pedido do dono ("Sua passagem está confirmada pra amanhã?"). Cada tipo tem o seu modelo da Meta em `settings.aviso_modelos` (`{horario, confirmacao, em_rota}`).
  **Lembrete automático da viagem** (issue #458, função `lembrete-viagem`, `lembretePuro.ts`, `database/121`): Ida na
  noite anterior (`settings.lembrete_viagem.ida_hora`, 21h — dono, 17/11), Volta 1 hora antes do horário do ponto (`volta_antes_min`),
  com dia, sentido, onde embarca, horário e quantidade, pedindo resposta se algo estiver diferente (nunca valor). A
  rotina roda de 5 em 5 min: quem agenda depois recebe na rodada seguinte enquanto a viagem não saiu; quem foi lançado
  pelo "Agendado ☑️" depois da hora do lembrete já recebeu a confirmação, que vale como lembrete. Uma vez por reserva
  (registro em `avisos_passageiros`, tipo `horario`), nada no horário de silêncio (23h–6h), envio pelo `avisar-passageiros`.
  Liga/desliga em `settings.lembrete_viagem.ativo` (autorizado pelo dono em 14/11; ligado em 17/11, modelo `aviso_horario` aprovado na Meta).
- **Dados na marca** (issue #420, `marcaDaEquipe.ts`): "Agendado ☑️ seg Ida Estiva 2P" — dia, sentido, quantidade,
  ponto/local, bairro e cidade da Volta escritos pela equipe na marca **vencem a leitura**. A marca sozinha continua igual.
