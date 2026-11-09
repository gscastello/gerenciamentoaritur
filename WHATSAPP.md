# WHATSAPP.md — Bot de WhatsApp (Chatwoot + Coexistência)

O número de WhatsApp Business da empresa está no **Chatwoot Cloud** por
**Coexistência** (recurso oficial da Meta): o app do celular continua
funcionando e a API funciona junto no mesmo número. O Chatwoot é o provedor
autorizado pela Meta; o bot é um **Agent Bot** do Chatwoot.

```
Cliente ⇄ WhatsApp ⇄ Meta ⇄ Chatwoot Cloud (caixa "Aritur WhatsApp")
                                   │ webhook assinado (message_created)
                                   ▼
                  Edge Function `chatwoot-bot` (Supabase)
                    ├─ conversationEngine  (roteiro de reservas, determinístico)
                    ├─ nluService          (Claude só extrai campos)
                    ├─ botAnswer           (Claude responde dúvidas só com a base de conhecimento)
                    └─ whatsappService     (RPCs/consultas ao Postgres)
                                   │ API REST do Chatwoot (resposta / nota privada / status)
                                   ▼
                              Chatwoot → cliente
```

## 1. Regras de segurança do bot

- O Claude **nunca** decide preço, vaga, horário ou confirmação: tudo isso vem
  do banco. Reserva/cancelamento/alteração só pelo motor de reservas.
- Respostas livres (dúvidas) usam **só** a base de conhecimento (Sistema → Bot de
  WhatsApp) + dados ao vivo. Fora disso, o bot transfere para a equipe. Um número,
  horário ou valor que não esteja nas fontes **barra** a resposta (`botGuard.ts`).
- Só responde a quem escreveu (janela de 24 h). Sem propaganda, sem mensagem em massa.
- O bot continua ativo mesmo quando a equipe responde pelo celular; **só cala** na
  transferência completa (conversa marcada como humano / status Aberta no Chatwoot).
  Para devolver ao bot: mudar o status da conversa para **Pendente** no Chatwoot.

## 2. Pré-requisitos (já feitos em 2026-10-15)

- Número +55 98 8101-2388 conectado ao Chatwoot por Coexistência (inbox id `146985`).
- **Business AI** da Meta desconectada no app (Ferramentas para empresas → Sua
  Business AI → Respostas da IA → Desconectar IA). Ela bloqueia a conexão.
- Abrir o app WhatsApp Business no celular **ao menos a cada 13 dias** e nunca desinstalar.

## 3. Banco (Supabase, nesta ordem)

1. `database/06-whatsapp.sql` — conversas, mensagens, modo de atendimento.
   **Não rodar o `07-scheduling.sql` ainda** (lembretes por modelo ainda não saem pelo Chatwoot).
2. `database/50-base-conhecimento-bot.sql`, `database/51-bot-chatwoot.sql` e
   `database/52-painel-atendimento-whatsapp.sql` (espelho da fila do Chatwoot, perguntas sem resposta).
3. Criar o usuário do bot em **Sistema → Equipe**: nome exato `Bot WhatsApp`, e-mail
   `bot@rota-pirapemas.local`, papel **atendente**. É ele que aparece na auditoria.
4. `database/64-sombra-aprende.sql` — observações, lições e anotações de clientes: o bot aprende em qualquer modo (ver §6b).
5. `database/66-endereco-de-costume.sql` — endereço de costume do cliente recorrente, para agendar com 1 clique no app e
   para o bot propor o pedido pronto (ver §6d). (O 65 corrige o índice das observações.)
6. `database/69-licao-operacao.sql` — lições de operação: paradas, plataforma e chegada (ver §6c).
7. `database/70-precos-por-trecho.sql` — tabela de trechos e sugestões de preço para o dono aprovar em Sistema (ver §6c).
8. `database/72-rascunhos-de-reserva.sql` — reservas preparadas pela IA para a equipe lançar com um toque (ver §6e).

## 3b. Painel "Atendimento" (no app)

A aba **Atendimento** (admin/atendente) mostra, em tempo real: conversas com a equipe e
com o bot (status do Chatwoot), pendências abertas, perguntas que o bot não soube
responder (com atalho pra cadastrar a resposta na base) e o botão **Abrir no Chatwoot**.
O estado vem do próprio `chatwoot-bot`, que espelha cada evento do Chatwoot em
`whatsapp_conversations` — não há token do Chatwoot no navegador. Só aparecem conversas
com atividade **depois** que o Agent Bot foi ligado à caixa.

**Nomes:** o nome do perfil do WhatsApp (muitas vezes apelido) aparece ao lado do nome do
**cadastro**. O bot nunca cadastra ninguém com o nome do perfil — pergunta ao cliente — e,
quando o cliente já existe, tenta renomear o contato no Chatwoot para o nome do cadastro
(melhor esforço; depende da permissão do token).

## 4. Deploy e secrets

```bash
supabase functions deploy chatwoot-bot --no-verify-jwt
supabase functions deploy bot-aprender            # botão "Aprender agora" (só admin; com verificação de JWT)
supabase secrets set ANTHROPIC_API_KEY=...        # console.anthropic.com
supabase secrets set CHATWOOT_ACCOUNT_ID=188239
supabase secrets set CHATWOOT_INBOX_ID=146985
supabase secrets set CHATWOOT_API_TOKEN=...       # token do Agent Bot (passo 5)
supabase secrets set CHATWOOT_WEBHOOK_SECRET=...  # segredo do Agent Bot (passo 5)
```

Nunca cole esses valores em chat, issue ou PR. URL da função:
`https://szwnsacgpsvioswrelqo.functions.supabase.co/chatwoot-bot`

## 5. Criar o Agent Bot no Chatwoot

1. Configurações → **Robôs** (Bots) → **Adicionar robô**: nome `Bot AriTur`, **URL do
   webhook** = a URL da função (passo 4).
2. Abra o robô criado e copie o **token de acesso** (`CHATWOOT_API_TOKEN`) e o
   **segredo** do webhook (`CHATWOOT_WEBHOOK_SECRET`).
3. Configurações → Caixas de Entrada → **Aritur WhatsApp** → Configuração do robô:
   escolher `Bot AriTur` e salvar. Conversas novas passam a nascer **Pendentes**.

## 6. Modos (Sistema → Quem está atendendo agora)

| Modo | O que acontece |
|---|---|
| **Sombra (teste)** | O bot roda o roteiro inteiro, mas escreve a resposta como **nota privada** no Chatwoot e **não grava nada** no negócio (reserva, cancelamento, comprovante, transferência). Nada vai ao cliente. |
| **IA automática** | O bot responde ao cliente e confirma reservas sozinho. |
| **Manual** | O bot não responde; a conversa aparece como Aberta pra equipe. |

Comece em **Sombra** por alguns dias, leia as notas privadas e só então troque para
IA automática (a troca vale na hora, para todos os sócios).

## 6b. O que o bot aprende, em qualquer modo (issue #218)

**Objetivo:** o aprendizado é o **treino do bot para o modo automático**. Tudo o que ele aprende
aqui é o que ele vai usar quando atender sozinho, então o aprendizado é **contínuo e nunca para**
(ver "Como não estagna", abaixo). A Sombra é só o modo mais seguro de treinar; as lições valem
em qualquer modo.

O bot **está sempre aprendendo**, em qualquer modo de atendimento (**IA**, **manual** ou
**sombra**): guarda o texto do que o cliente escreve, do que o atendente responde (pelo celular
ou pelo Chatwoot), do que o próprio bot enviou e, no modo Sombra, do rascunho que ele teria
enviado (`bot_observations`, só texto, **apagado após 90 dias**, legível só pelo admin). Notas
privadas e anexos não entram.

De tempos em tempos (quando há material e passaram 6 h) ou ao clicar em **Sistema → Bot →
Aprender agora**, o modelo lê as conversas **sem nomes nem telefones** e devolve **lições**
(`bot_learnings`), acumulando: lição já conhecida só ganha evidência; texto melhor só substitui
o antigo se o dono ainda não revisou.

**Aprende só com o atendente (issue #232):** o que o bot enviou e os rascunhos ficam guardados, mas
não entram nas conversas lidas pelo aprendizado; o cliente entra como contexto e para aprender como
os clientes escrevem. O pedido ao modelo é de orientações gerais e casos isolados que ensinem o que
fazer, nunca roteiro, menu ou formulário fixo, nem relato sem orientação. Valor de trecho citado pelo
atendente vira `fato` e só vale depois de aprovado. Lição arquivada ou recusada não volta sozinha.

**O que chega às respostas:** o limite de tamanho é dividido entre os tipos, e a sobra passa para o
seguinte. Fatos e negócio: até 5.000 caracteres; estilo, fluxo e situação: até 6.000 e 20 por tipo;
linguagem: até 2.200. Dentro de cada tipo entram primeiro as mais vistas.

| Tipo | Como entra | Para que serve |
|---|---|---|
| Jeito dos clientes falarem | **Já vale**, com aviso "Está certo?" | O bot entende melhor gírias e pedidos (só leitura da mensagem) |
| Estilo do atendente / como o atendente agenda | **Já vale**, com aviso | Afina o tom e a ordem das perguntas nas respostas livres |
| O que responder em cada situação | **Já vale**, com aviso (com número: só depois de aprovada) | Mostra ao bot como o atendente reage a pedidos e problemas comuns |
| Informação do atendente (preço, regra, horário) | **Só depois de aprovada** | Entra nas respostas livres, sempre sob o `botGuard` |
| Como a empresa funciona | **Só depois de aprovada** | Entra nas respostas livres, sempre sob o `botGuard` |

**Clientes recorrentes:** para quem já tem 2 ou mais viagens, o bot mantém uma anotação por
cliente (`bot_customer_notes`: ponto de embarque de costume, dias em que viaja, jeito de pedir…).
Ela só serve para personalizar e **confirmar** ("o mesmo ponto de sempre?") nas respostas livres;
números dela nunca passam pelo `botGuard`. O dono vê, edita e desativa em **Sistema → Bot →
Aprendizado → Ver clientes recorrentes**.

**Como não estagna:**

- **Roda sempre que há material:** 20+ mensagens novas, ou qualquer quantidade esperando há mais
  de 24 h (semana fraca também aprende), respeitando 6 h entre rodadas.
- **Lição aprovada continua sendo reavaliada:** o bot nunca reescreve o que o dono revisou, mas
  quando as conversas novas mostram algo diferente (preço, horário, regra, jeito de atender) ele
  deixa uma **sugestão de atualização** na lição; o dono aceita ou mantém. Lição não revisada é
  atualizada direto, com aviso.
- **Lição velha volta para conferência:** em uso e sem aparecer nas conversas há 4 meses (e sem
  conferência do dono nesse tempo), vira "Está certo?" de novo (cron `flag-stale-bot-learnings`).
- **Lição nova entra no prompt:** o ranking considera quanto a lição apareceu **e** se apareceu
  recentemente; lição recente com pouca evidência não fica de fora para sempre.
- **Sem duplicatas:** o modelo vê as 150 lições mais recentes ao decidir se algo já é conhecido.

O bot continua **sem decidir preço, vaga, horário ou confirmação**: isso segue vindo do banco.
As lições só mudam como ele entende e como ele fala. O dono pode editar, recusar ou desativar
qualquer lição a qualquer momento.

## 6c. Atendente de IA conversacional (issue #224)

O bot **não usa mais menu numerado**. Cada mensagem de texto vai para um agente (Claude) que:

1. **espera ~5 s** para juntar mensagens seguidas do cliente (quem escreveu por último é quem recebe a resposta);
2. **lê a conversa inteira** direto do Chatwoot (o que o cliente disse, o que a equipe respondeu pelo celular e, no modo Sombra, os rascunhos anteriores do próprio bot);
3. fica **em silêncio por 10 min** depois de uma resposta humana, e só fala quando a última palavra foi do cliente;
4. **interpreta e responde** com: as informações da empresa (pontos, preços, base de conhecimento), as lições aprendidas (§6b), a anotação do cliente recorrente e **dados reais do app**, buscados por ferramentas.

| Ferramenta | Para quê |
|---|---|
| `consultar_viagem` | vagas e lotação de uma data/direção |
| `andamento_da_viagem` | estimativa pelo cronograma do dono (issue #244): confere a reserva, devolve a janela do lugar do cliente e se já estamos em rota; traz o contato do motorista (Sistema → Bot) para quando o cliente insiste em saber onde a van está |
| `listar_pontos_e_precos`, `calcular_valor` | horários e valor comparando embarque e desembarque: tabela de trechos, depois ponto/bairro (o modelo nunca faz a conta nem digita preço). Trecho em cidade intermediária sem valor vai para a equipe |
| `ver_minhas_reservas` | reservas e pagamentos **do próprio cliente** (nunca de outras pessoas) |
| `criar_reserva`, `remarcar_reserva`, `cancelar_reserva`, `entrar_na_lista_de_espera` | só depois do "sim" do cliente; preço e vaga conferidos pelo banco; fora da área padrão vira `pendente`; reserva duplicada na mesma viagem é recusada |
| `avisar_equipe`, `chamar_atendente` | recado na aba Pendências / passar a conversa para uma pessoa (encomenda, reclamação, reembolso, negociação, >10 passagens, algo que o app não mostra) |
| `nao_responder` | quando a mensagem não pede resposta ("ok", 👍) |

**Como ele reserva:** no ritmo do cliente (issue #238), com uma pergunta por mensagem e sem formulário; junta
os dados que o cliente manda picados em várias mensagens; infere o sentido
(embarque em São Luís = Ida; Cantanhede/Pirapemas = Volta; "madrugada" = Ida da manhã com busca em casa),
o ponto e o local de desembarque cadastrado; confere vaga e valor no app;
manda um **resumo completo** (nome, dia/data, sentido e horário, ponto e endereço, desembarque, quantidade,
pagamento, total) e pergunta "Posso confirmar?"; **só cria a reserva depois do "sim"**. Se o cliente der o
nome completo e o cadastro tiver só um nome/apelido, o cadastro é completado.

**Travas:** número/horário/valor da resposta só se vier de uma ferramenta, das informações da empresa
ou do cliente (`botGuard`; uma volta de correção antes de desistir e chamar a equipe); a resposta só
diz que mexeu numa reserva se a ferramenta deu certo; nada de identificador interno nem dado de
terceiros. **Sombra:** a resposta vira nota privada e as gravações viram "criaria…" (nada é salvo).
**Chave de emergência:** `update settings set value = '{"engine":"roteiro"}' where key = 'bot_engine'`
(ou insira a linha) devolve o roteiro antigo na hora, sem deploy; `{"engine":"agente"}` volta ao novo.
**Log:** `bot_agente_resposta` (ferramentas usadas, tokens, tempo), `bot_agente_barrado`,
`bot_agente_silencio`, `bot_agente_cedeu`. `tokens_entrada` conta só o que não veio do cache;
`tokens_cache_escrita` e `tokens_cache_leitura` têm preço próprio (issue #230).

**Cache de prompt (issue #230):** as ferramentas e o bloco estável das instruções (regras, estilo, dados da
empresa) são reaproveitados por 5 minutos, renovados a cada uso. Por isso, horário, calendário e dados do cliente
ficam **sempre depois** do ponto de cache (`blocosDoSistema`): um dado variável antes dele anula a economia sem
dar erro. Editar preço, regra ou lição apenas gera um cache novo; o bot nunca usa texto antigo. Vagas e reservas
vêm das ferramentas na hora e não entram no cache. Se `tokens_cache_leitura` ficar em zero nos logs, algo variável
entrou no bloco estável.

## 6d. Cliente recorrente: endereço de costume (issue #228)

Quem viaja sempre do mesmo lugar não precisa repetir tudo. O **endereço de costume** é **por cliente e por
sentido** (Ida e Volta separados) e a regra mora num lugar só, `rpc_endereco_de_costume` (o app e o bot chamam a mesma):

1. **Fixado pela equipe** (aba Passageiros → card do passageiro → *Endereço de costume* → Fixar/Editar). Vale sempre
   e sobrepõe o automático. *Soltar* devolve o sentido ao histórico. Fica em `customer_habitual_addresses`.
2. **Histórico:** o local mais frequente (empate: o mais recente) entre as reservas confirmadas/embarcadas daquele
   sentido, desde que o cliente tenha **2 ou mais**. Grafia parecida ("Prime Calhau", "prime  calhau") é o mesmo
   local; "Cohab Anil II" e "III" **não** se misturam. O botão *Fixar* promove o do histórico a fixado.

**No app:** *Agendar Ida/Volta* (destaque no sentido provável: o oposto da última viagem) abre a **nova reserva já
preenchida** (ponto, bairro, rua, desembarque, pagamento padrão); a **data da viagem é escolhida ali mesmo** (padrão: amanhã); a equipe confere e clica *Agendar*. Preço,
vaga e duplicidade seguem como em qualquer reserva.

**No bot:** a ferramenta `endereco_de_costume` devolve o costume do **próprio cliente** (sem valor). O bot propõe o
pedido pronto ("Ida amanhã, saindo de …, descendo em …, 1 passagem, no dinheiro. Posso confirmar?"), **sem citar
valor** a menos que o cliente pergunte, nunca presume a data e **só cria depois do "sim"**. Se o cliente mudar algo,
vale o que ele disser. Sem costume (cliente novo ou sem repetição) o fluxo normal continua igual.

## 6e. Reservas preparadas pela IA (issue #254)

Quando quem atende é a equipe (modo **manual** ou **sombra**, ou conversa transferida para humano), o `chatwoot-bot`
prepara a reserva para ela lançar com um toque:

1. Depois de cada mensagem do cliente, espera ~20 s (`BOT_RASCUNHO_ESPERA_MS`) para ele terminar de escrever. Se
   chegou mensagem mais nova, quem cuida é ela.
2. Filtro barato: sem data citada pelo cliente nas últimas 48 h ("amanhã", "sexta", "dia 12", "12/11"), não chama o
   modelo.
3. Um modelo pequeno (`BOT_RASCUNHO_MODELO`, padrão `claude-haiku-5-5`) lê o fim da conversa e devolve até dois pedidos
   (ida e volta) pela ferramenta `registrar_pedidos`. A validação é pura (`_shared/rascunhoPuro.ts`): precisa de
   **data + endereço ou ponto** (regra do dono). O sentido sai do ponto; endereço em São Luís sem ponto = busca em casa;
   quantidade sem número = 1.
4. Cliente que já tem reserva naquela viagem não gera rascunho. Há um rascunho aberto por conversa e sentido: se o
   cliente corrige a data, o mesmo rascunho é atualizado. O nome é o do cadastro ou o que o cliente **escreveu**
   (nunca o perfil do WhatsApp).
5. No app, aba **Atendimento → Reservas prontas para lançar**: **Lançar** abre a nova reserva já preenchida (preço e
   vaga pelo app, como sempre); **Descartar** tira da lista. Encomenda não tem Lançar nem valor: **Copiar anotação**
   gera a linha `E <onde buscar> <telefone>` para a caixinha da Agenda.
6. Criar a reserva daquele cliente naquela viagem, por **qualquer** caminho (app, anotação, bot, Claude), fecha o
   rascunho sozinho (gatilho `trg_reservations_fecha_rascunho`).

Nada é reservado nem respondido ao cliente por aqui. Log: `bot_rascunho_preparado` (pedidos, gravados, motivos,
tokens) e `bot_aviso` com `rascunho_falhou` / `rascunho_nao_gravado`.

## 7. Checklist de teste (em modo Sombra)

1. Mande uma mensagem de outro número → aparece uma nota privada `[SOMBRA]` com a resposta.
2. Responda pelo **app do celular** → a mensagem aparece no Chatwoot e o bot continua respondendo à seguinte.
3. Peça "falar com atendente" → nota "Transferiria…" (em IA real: conversa vira Aberta).
4. Pergunte algo que está na base (ex.: bagagem) e algo que não está → responde / transfere.
5. Mande um áudio → pede pra escrever; um segundo áudio → transfere.
6. Mande uma **figurinha** → o bot ignora (sem resposta). Mande uma foto qualquer sem Pix pendente → resposta neutra + pendência para a equipe, **sem** tirar o bot da conversa. Com Pix pendente → arquiva como comprovante. Em modo **manual** ou conversa em atendimento humano, o bot só arquiva comprovante, sem responder.
7. **Confusão embarque × desembarque:** numa Volta, quando o bot pedir o endereço de embarque, responda só "retorno" → o bot explica que Retorno é local de *desembarque* em São Luís, repete a pergunta e depois confirma "Você mencionou *Retorno*. É lá que você vai ficar?". Teste também "Pirapemas" quando ele perguntar o desembarque.
8. Reserve ida de ponta a ponta → nota "Criaria a reserva…", **nenhuma** reserva nova no app.

## 8. Limites conhecidos

- **Opções** vão como texto numerado ("1 - Ida"); o cliente responde com o número ou o nome. Botões/listas do WhatsApp via Chatwoot não foram validados.
- **Lembretes e "motorista a caminho"** (modelos aprovados fora das 24 h) **não existem mais**: o `whatsapp-notifications-dispatcher` (Meta direto) foi removido. Reimplementar pela API de modelos do Chatwoot é trabalho futuro (issue própria).
- **Áudio** não é entendido (peça para escrever; insistindo, vai pra equipe).
- Histórico antigo das conversas pode não sincronizar com o Chatwoot.
- O CI roda o job **Funções (Deno)** (`deno check` da função + `deno test supabase/functions/_shared`). Localmente: `deno test supabase/functions/_shared`.
- Se for ativar proteção de branch, inclua o check **Funções (Deno)** nos obrigatórios.
