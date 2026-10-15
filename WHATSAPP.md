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
2. `database/50-base-conhecimento-bot.sql` e `database/51-bot-chatwoot.sql`.
3. Criar o usuário do bot em **Sistema → Equipe**: nome exato `Bot WhatsApp`, e-mail
   `bot@rota-pirapemas.local`, papel **atendente**. É ele que aparece na auditoria.

## 4. Deploy e secrets

```bash
supabase functions deploy chatwoot-bot --no-verify-jwt
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

## 7. Checklist de teste (em modo Sombra)

1. Mande uma mensagem de outro número → aparece uma nota privada `[SOMBRA]` com a resposta.
2. Responda pelo **app do celular** → a mensagem aparece no Chatwoot e o bot continua respondendo à seguinte.
3. Peça "falar com atendente" → nota "Transferiria…" (em IA real: conversa vira Aberta).
4. Pergunte algo que está na base (ex.: bagagem) e algo que não está → responde / transfere.
5. Mande um áudio → pede pra escrever; um segundo áudio → transfere.
6. Reserve ida de ponta a ponta → nota "Criaria a reserva…", **nenhuma** reserva nova no app.

## 8. Limites conhecidos

- **Opções** vão como texto numerado ("1 - Ida"); o cliente responde com o número ou o nome. Botões/listas do WhatsApp via Chatwoot não foram validados.
- **Lembretes e "motorista a caminho"** (modelos aprovados fora das 24 h) ainda não saem pelo Chatwoot (`sendTemplate` recusa de propósito).
- **Áudio** não é entendido (peça para escrever; insistindo, vai pra equipe).
- Histórico antigo das conversas pode não sincronizar com o Chatwoot.
- Funções do bot **não rodam no CI**; testes puros: `cd supabase/functions/_shared && deno test`.
