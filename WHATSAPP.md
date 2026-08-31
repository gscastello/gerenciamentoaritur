# WHATSAPP.md — Deploy da integração real

## 1. Pré-requisitos no lado da Meta

1. Criar um app no [developers.facebook.com](https://developers.facebook.com) com o produto **WhatsApp**.
2. Pegar (em WhatsApp → API Setup): `Temporary access token` (trocar depois por um permanente via System User), `Phone number ID`.
3. Criar (ou usar o de teste) um número do WhatsApp Business.
4. Criar os **templates** usados pelo dispatcher (WhatsApp → Message Templates), categoria "Utility":
   - `lembrete_viagem` — corpo: `Sua viagem é hoje às {{1}}, saindo de {{2}}. Esteja pronto com antecedência!`
   - `motorista_a_caminho` — corpo: `O motorista está a caminho de {{1}}. Fique atento(a)!`
   Templates precisam ser **aprovados pela Meta** antes de funcionar — pode levar algumas horas.

## 2. Rodar as migrações do banco (nesta ordem, depois das 01-05 já rodadas)

```
database/06-whatsapp.sql
database/07-scheduling.sql
```

Antes de rodar o `06`, crie o usuário do bot no Supabase Auth (Authentication → Users → Add user), com e-mail `bot@rota-pirapemas.local` (ou o que preferir — só ajuste o e-mail no `06-whatsapp.sql` para bater). É esse usuário que aparece na auditoria como autor de tudo que a IA faz.

No `07-scheduling.sql`, troque a URL (`https://SEU-PROJETO.functions.supabase.co/...`) pela URL real das suas Edge Functions e o valor do `x-dispatch-secret` pelo mesmo `DISPATCH_SECRET` que você vai configurar no passo 4.

## 3. Deploy das Edge Functions

Com a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada e logada (`supabase login`, `supabase link --project-ref SEU_PROJETO`):

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-notifications-dispatcher --no-verify-jwt
```

## 4. Configurar os secrets das funções

```bash
supabase secrets set WHATSAPP_TOKEN=seu-token-da-meta
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=seu-phone-number-id
supabase secrets set WHATSAPP_VERIFY_TOKEN=escolha-uma-string-qualquer-só-sua
supabase secrets set DISPATCH_SECRET=escolha-outra-string-qualquer-só-sua
supabase secrets set ANTHROPIC_API_KEY=sua-chave-da-api-da-anthropic
```

## 4.1 Sobre a camada de entendimento de linguagem natural (nluService)

Mensagens de texto livre (não clique de botão) agora passam pelo
`nluService.ts` antes de cair na máquina de estados. Ele usa a API da
Anthropic com **saída estruturada forçada** (`tool_choice` obrigando uma
chamada de ferramenta) — o modelo nunca devolve texto livre, só um JSON
com os campos que conseguiu identificar (intenção, direção, data,
quantidade, ponto de embarque, bairro, forma de pagamento).

Isso preserva a garantia central do sistema: **o modelo nunca decide
preço, vaga ou confirmação** — ele só entende "o cliente quer ir na
sexta, são 3 pessoas, vai sair da Rodoviária" e devolve isso como dados.
Cada campo extraído passa pela mesma consulta ao banco que passaria se o
cliente tivesse clicado botão por botão (`checkAvailability`,
`listRoutePoints`, `getNeighborhoodPrice`) — o `conversationEngine` só
pula a *pergunta* de um campo que já foi dito, nunca pula a *validação*
desse campo.

Se o cliente mandar uma mensagem confusa ou fora do previsto, o campo
`confidence` volta `"baixa"` e o bot mostra o menu de novo em vez de
adivinhar — a extração é usada para **acelerar**, nunca para **arriscar**.

(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente dentro de toda Edge Function — não precisa configurar.)

## 5. Registrar o webhook no painel da Meta

Em WhatsApp → Configuration → Webhook:
- **Callback URL**: `https://SEU-PROJETO.functions.supabase.co/whatsapp-webhook`
- **Verify token**: o mesmo valor que você colocou em `WHATSAPP_VERIFY_TOKEN`
- Inscrever no campo **messages**.

A Meta faz uma chamada `GET` na hora de salvar — se o `whatsapp-webhook/index.ts` responder certo (ver código, seção `GET`), aparece "Verified" na tela.

## 6. Checklist de teste ponta-a-ponta

- [ ] Mandar "oi" pelo número de teste → deve chegar o menu com as opções.
- [ ] Escolher "Ida" → informar uma data válida → deve mostrar os pontos de embarque reais (os que estão em `route_points`, editáveis pela aba Sistema do painel).
- [ ] Mandar uma mensagem só de texto, tipo "quero 2 passagens de ida dia 10/09 saindo da rodoviária" → o bot deve pular direto para perguntar só o que faltou (quantidade e ponto já preenchidos), não repetir perguntas já respondidas.
- [ ] Mandar uma mensagem ambígua/fora do assunto ("oi, vocês vendem passagem para outra cidade?") → o bot deve mostrar o menu, nunca inventar uma resposta.
- [ ] Completar uma reserva de teste → conferir que ela aparece na Agenda do painel React em tempo real.
- [ ] Conferir em `audit_logs` que a criação foi registrada com `performed_by` = usuário "Bot WhatsApp".
- [ ] No painel, mudar o modo de atendimento para "Manual" (aba Sistema) → mandar outra mensagem de teste → confirmar que a IA **não** responde nada (fica só logado em `whatsapp_messages`).
- [ ] Voltar para "IA" e testar o fluxo de lotação: reservar até esgotar a capacidade de teste, confirmar que a próxima tentativa oferece lista de espera em vez de dar erro cru.
- [ ] No painel, chamar `rpc_start_trip` para uma viagem de teste (ou usar o botão "Iniciar viagem" da Agenda) → esperar o próximo ciclo do `whatsapp-notifications-dispatcher` (até 5 min) → conferir que o cliente de teste recebe o template `motorista_a_caminho`.

## 7. Observação sobre custo e janela de 24h

A Meta cobra por conversa e exige **template pré-aprovado** para qualquer mensagem enviada fora de uma janela de 24h desde a última mensagem do cliente. Por isso lembrete e "motorista a caminho" usam `sendTemplate` (não `sendText`) — são mensagens que a empresa inicia, não uma resposta a algo que o cliente mandou.
