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

O bot **está sempre aprendendo**, em qualquer modo de atendimento (**IA**, **manual** ou
**sombra**): guarda o texto do que o cliente escreve, do que o atendente responde (pelo celular
ou pelo Chatwoot), do que o próprio bot enviou e, no modo Sombra, do rascunho que ele teria
enviado (`bot_observations`, só texto, **apagado após 90 dias**, legível só pelo admin). Notas
privadas e anexos não entram.

De tempos em tempos (quando há material e passaram 6 h) ou ao clicar em **Sistema → Bot →
Aprender agora**, o modelo lê as conversas **sem nomes nem telefones** e devolve **lições**
(`bot_learnings`), acumulando: lição já conhecida só ganha evidência; texto melhor só substitui
o antigo se o dono ainda não revisou.

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

O bot continua **sem decidir preço, vaga, horário ou confirmação**: isso segue vindo do banco.
As lições só mudam como ele entende e como ele fala. O dono pode editar, recusar ou desativar
qualquer lição a qualquer momento.

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
