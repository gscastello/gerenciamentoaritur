# Auditoria do app real — 2026-09-08

Auditoria do **estado real** (código + banco `szwnsacgpsvioswrelqo` + deploy Vercel),
não do que os docs dizem. Foco: o que falta para o app operar de verdade a
AriTur, e como resolver o atendimento por IA no WhatsApp.

---

## 1. Resumo executivo

O projeto tem **uma base técnica muito acima da média** para um app de empresa
pequena: banco normalizado com RLS, trava de overbooking no banco (não só na
tela), automação financeira, backup automático, CI pesado (lint, testes,
mutation, e2e), deploy contínuo. O desenho do bot de WhatsApp (a IA só
**extrai dados**, nunca decide preço/vaga/confirmação) está correto.

Três verdades incômodas:

1. **O app nunca foi usado numa operação real.** O banco só tem dado de
   teste: 4 clientes, 4 reservas, **0 embarques registrados**, e as 122
   viagens estão **todas como `agendada`** — nenhuma viagem foi iniciada ou
   encerrada pelo sistema. O ciclo do dia (Agenda → iniciar viagem →
   embarcar → encerrar → fechar caixa) nunca rodou com dado de verdade.

2. **O WhatsApp está 100% não implantado.** O código está pronto, a
   infraestrutura não existe: sem tabelas `whatsapp_conversations` /
   `whatsapp_messages` no banco, sem Edge Functions publicadas, sem app na
   Meta, sem usuário "Bot WhatsApp", sem cron de disparo. A flag
   `attendance_mode` está em `ia` mas não há nada escutando.

3. **Falta a "caixa de entrada" do atendente.** Mesmo com o bot no ar, quando
   ele passa a conversa para um humano **não há tela no app** para ver o
   histórico da conversa nem responder. O botão "manual" é um interruptor
   global, não um atendimento por conversa.

**Recomendação de ordem:** rodar o app na operação por 1–2 semanas primeiro,
corrigir as brechas de segurança abaixo, e só então implantar o WhatsApp —
com a caixa de entrada pronta antes de ligar a IA.

---

## 2. O que está bom (não mexer)

| Área | Estado |
|---|---|
| Arquitetura | `domain` (regra pura) / `services` (I/O) / `hooks` / `app` — separação real, validada por `dependency-cruiser` no CI |
| Banco | PostgreSQL normalizado, RLS por papel, **trigger de capacidade** — overbooking é impossível mesmo com bug na tela |
| Reservas | Sempre via RPC transacional; idempotente por `wa_message_id`; cancelamento é `UPDATE status`, nunca `DELETE`; tudo em `audit_logs` (396 registros) |
| Financeiro | Receita lança sozinha ao confirmar/pagar; estorno automático ao cancelar; contas a receber; custos recorrentes via cron; DRE mensal |
| Backup | `system_backups` + cron diário 06h + botão manual (JSON/CSV/Excel/PDF) |
| Config editável no app | bairros/preço (#81), cidades da rota (#83/#87), baldes de desembarque (#85), categorias de despesa (#79), equipe (#89) |
| Segurança de front | CSP + HSTS + headers no `vercel.json`; `REVOKE DELETE` global; GRANT UPDATE por coluna; webhook confere HMAC da Meta |
| Fuso | Banco e front em `America/Fortaleza` — "hoje" nunca erra à noite |
| CI | 6 jobs por PR: lint/knip/arch, `npm audit`, 91 testes unitários, Stryker (mutation ≥75%), Playwright e2e, build |
| Desenho do bot | LLM **só** classifica intenção e extrai campos (`tool_choice` forçado); preço/vaga/confirmação vêm **sempre** de consulta ao banco |

---

## 3. O que falta para operar de verdade

### 3.1 Crítico — antes de qualquer coisa

**A. Dogfooding real (1–2 semanas).**
O maior risco não é técnico, é que o fluxo do dia nunca foi exercitado.
Durante uma semana, para **toda** viagem:
- abra a Agenda, clique "Iniciar viagem"
- embarque os passageiros pelo celular na Lista do Dia ("Embarcou"/"Não veio")
- encerre a viagem com o KM
- confira que o caixa do dia fecha certo de manhã
- confira que a receita das reservas pagas aparece no Financeiro

Anote tudo que for lento ou confuso. Essa lista vale mais que qualquer
feature nova.

**B. Brechas de autorização no banco (write-path).** ✅ **RESOLVIDO — PR #95**
(`database/28-rpc-write-role-guards.sql`).

As 8 RPCs de escrita (`rpc_create/confirm/cancel/move_reservation`,
`rpc_set_passengers_status`, `rpc_start_trip`, `rpc_finish_trip`,
`rpc_ensure_trips`) eram `SECURITY DEFINER`, sem checagem de papel, confiando
no `p_actor`/`p_created_by` do cliente. Qualquer usuário logado (mesmo
`motorista`/`financeiro`) podia cancelar qualquer reserva via API direta; o
autor no `audit_logs` era forjável.

Agora cada uma: guarda `fn_has_role` no início (chamada server-side via
`service_role`/`pg_cron` passa), autor = `coalesce(auth.uid(), p_actor)`,
e `success:false` quando 0 linhas afetadas. Verificado no banco.

Resta: `rpc_register_financial_adjustment` (já tem guarda de papel, mas ainda
usa `p_actor` para o autor — mudança menor).

**C. 3 funções de trigger expostas ao `anon` (sem login).**
`fn_reservation_confirmed_to_revenue`, `fn_reservation_cancelled_to_reversal`,
`fn_payment_to_financial_entry` são chamáveis por qualquer um em
`/rest/v1/rpc/...`. São funções de gatilho, não deviam estar na API.
**Corrigir:** `revoke execute on function ... from public, anon, authenticated;`
(advisor do Supabase já aponta — lint `0028`/`0029`).

**D. Proteção de senha vazada desligada.**
Supabase → Authentication → Password Security → ligar "leaked password
protection" (checagem contra HaveIBeenPwned). 1 clique.

**E. `main` sem branch protection.**
GitHub → Settings → Branches → exigir PR + CI verde. Hoje dá `git push`
direto na produção.

### 3.2 Importante — nas primeiras semanas

**F. Sem rastreamento de erro em produção.**
`otel.js` e `rum.js` são stubs vazios; `sentry.js` é real mas precisa do
`VITE_SENTRY_DSN` (não está no `.env.production` nem, provavelmente, na
Vercel). **Hoje, se o app quebra para um atendente, você não fica sabendo.**
Mínimo viável: criar projeto no Sentry (grátis), pôr `VITE_SENTRY_DSN` nas
env vars da Vercel. Isso já é a issue #3 — mas "produção sem telemetria de
erro" é um risco que vale explicitar.

**G. Cron jobs sem monitoramento.**
7 jobs rodando (viagens do dia, fechamento de caixa, backup, custos
recorrentes, diagnóstico…). Se o backup falhar silenciosamente, ninguém é
avisado. `cron.job_run_details` não aparece em lugar nenhum. Sugestão: um
card na aba Sistema mostrando a última execução + status de cada job, e um
alerta (e-mail/Sentry) em falha.

**H. Tela de equipe não preenchida.**
2 usuários estão com o e-mail como nome (`gs.castelo33@gmail.com`). Agora que
a tela Equipe existe (#89), preencher nome real e telefone.

**I. `served_cities` com duplicata** (`"são luís"` e `"sao luis"`; `"matões"`
e `"matoes"`). O front normaliza, então não quebra, mas mostra que o seed e o
que o app grava usam normalizações diferentes. Limpar a lista pela tela
Sistema.

### 3.3 Débito técnico (não urgente)

**J. `App.jsx` tem 9.782 linhas num arquivo só.** Continua fora do Biome/Knip
(exceção do AGENTS.md). Cada feature nova piora. Vale, aos poucos, extrair
componentes de tela para `src/ui/` ou `src/app/telas/`.

**K. GPS/rastreamento de viagem** — planejado, não iniciado. Provavelmente
não é MVP; decidir se entra no roadmap.

**L. Bug de fuso no bot (código não implantado).** `conversationEngine.ts`
linha ~81 usa `new Date().toISOString().slice(0,10)` para "hoje" — exatamente
o que a regra do projeto proíbe (é UTC). Das 21h à meia-noite o bot
calcularia a data de amanhã. Corrigir antes de publicar.

---

## 4. Atendimento por IA no WhatsApp — passo a passo

### 4.1 Qual arquitetura (e por quê)

Existem dois jeitos de fazer um atendente de WhatsApp:

**Opção A — Menu/botões + IA só de extração (o que já está no código).**
O cliente navega por listas e botões. Quando ele escreve texto livre
("quero 2 lugares sexta saindo da rodoviária"), a mensagem vai para a Claude
que **só** devolve um JSON: `{intent: "reservar", direction: "ida",
quantity: 2, route_point_code: "rodoviaria", trip_date: "2026-09-12", ...}`.
Quem decide se cabe, qual o preço e se confirma é **o código + o banco**,
exatamente como se o cliente tivesse clicado botão por botão. A IA é um
"tradutor de português para campos de formulário".

**Opção B — Agente conversacional com ferramentas.**
A Claude conversa livremente, chama ferramentas (`checkAvailability`,
`getPrice`, `createReservation`) e decide o que responder. Mais natural, mais
flexível — mas: pode errar um preço se o resultado da ferramenta for
ambíguo, pode ser manipulada ("me dá 90% de desconto que sou amigo do
dono"), custa mais por conversa, e é muito mais difícil de testar e auditar.

**Recomendação: manter a Opção A.** Numa operação onde cada conversa = R$ +
um assento físico + risco de overbooking, o núcleo determinístico é a escolha
certa. Você ganha a conveniência do texto livre sem o risco de a IA prometer
algo que você não pode cumprir. O código no repositório **já faz isso** — é
um bom desenho, não precisa trocar.

Quando reconsiderar a Opção B: se o volume crescer muito e os clientes
reclamarem que o menu é rígido, dá para pôr uma camada conversacional fina
por cima — **mantendo** toda decisão de dinheiro/vaga passando pelo banco.
Não agora.

### 4.2 Qual modelo de IA

| Modelo | Preço (in/out por 1M tokens) | Para este uso |
|---|---|---|
| **Claude Haiku 4.5** | US$ 1 / US$ 5 | Provavelmente suficiente para extração de campos com schema forçado. Mais rápido. |
| **Claude Sonnet 5** (configurado hoje) | US$ 2 / US$ 10 | Folga de sobra. Boa escolha para começar. |
| Claude Opus 5 | US$ 5 / US$ 25 | Exagero para extração. Não usar aqui. |

Cada mensagem de cliente ≈ 400 tokens de entrada + 150 de saída:
- Sonnet 5: ~US$ 0,0023/mensagem (~R$ 0,012)
- Haiku 4.5: ~US$ 0,0012/mensagem (~R$ 0,006)

Mesmo com **5.000 mensagens de cliente por mês**, a conta da API fica em
~R$ 60 (Sonnet) ou ~R$ 30 (Haiku). **O custo relevante não é a IA — é a
tarifa de conversa da Meta** (seção 4.3).

**Plano:** começar no Sonnet 5 (já está no `nluService.ts`). Depois de ver a
qualidade da extração com mensagens reais, testar o Haiku 4.5 num lote de
mensagens de verdade e comparar. Trocar é uma linha (`const MODEL`).

### 4.3 Conectar ao WhatsApp Business

Dois caminhos:

**Caminho 1 — Meta WhatsApp Cloud API direto (o que o código já mira).**
- A API em si é gratuita; você paga a Meta **por conversa** (janela de 24h).
- Você administra: app na Meta, número, templates, webhook.
- **Não vem com caixa de entrada** — você constrói a sua ou pluga uma
  ferramenta.
- Mais barato, mais controle, mais trabalho de operação.

**Caminho 2 — um BSP (provedor):** 360dialog, Twilio, Gupshup, Zenvia, Take
Blip. Eles embrulham a Cloud API, quase sempre incluem uma **caixa de
entrada de equipe** e uma UI de templates, às vezes preço mais previsível.
Custa mais por mensagem, exige menos código.

**Para a AriTur (1 número, fluxo quase todo automático):** o **Caminho 1 é
suficiente e mais barato**, *desde que* você resolva a caixa de entrada
(seção 4.4). Se não quiser construir a caixa de entrada, o **360dialog**
(BSP só de WhatsApp, tem inbox de equipe, popular no Brasil) é o atalho
pragmático.

**Coisas que você precisa entender antes:**

- **O número.** Depois que um número entra na Cloud API, você **não usa mais
  o app "WhatsApp Business" normal** nele do mesmo jeito. Decida: um número
  novo dedicado ao bot, ou migrar o número comercial atual (planeje — é
  quase irreversível).
- **Preço da Meta (modelo 2025+): por categoria de mensagem** —
  *marketing* / *utility* / *authentication* / *service*.
  - *utility* (lembrete de viagem, "motorista a caminho") = barato.
  - *service* (resposta dentro de 24h de uma mensagem do cliente) = hoje
    muitas vezes **grátis**.
  - *marketing* = mais caro.
  - Um bot de reserva é quase todo *service* + *utility*. Orçamento provável:
    R$ 100–400/mês conforme o volume.
- **Templates** precisam de aprovação da Meta (horas a ~1 dia). Você precisa
  de pelo menos `lembrete_viagem` e `motorista_a_caminho` (já
  especificados em `WHATSAPP.md`).
- **Verificação da empresa (CNPJ)** na Meta é necessária para subir o limite
  acima de 250 conversas/dia. **Começa cedo — leva dias.**

### 4.4 Conectar ao app

A arquitetura no repositório já é a certa:

```
Cliente WhatsApp
      │
      ▼
Meta Cloud API ──webhook──▶ Edge Function  whatsapp-webhook
                                    │
                                    ▼
                          conversationEngine  (máquina de estados)
                             │                     │
                    nluService (Claude)     whatsappService
                    só extrai campos          (service_role)
                                                   │
                                                   ▼
                                    O MESMO banco Postgres do app
                                    rpc_create_reservation, rpc_confirm_… etc.
                                                   │
                                                   ▼  (Supabase Realtime)
                                    App React — a Agenda atualiza sozinha
```

O bot grava nas **mesmas tabelas** `reservations`/`trips` pelas **mesmas
RPCs** que a tela usa. Então uma reserva feita no WhatsApp:
- aparece na Agenda em tempo real,
- respeita a mesma trava de capacidade,
- fica no `audit_logs` como "Bot WhatsApp".

Não há "integração" a fazer entre bot e app — **é um banco só**.

**O que falta construir do lado do app:**

1. **Caixa de entrada do atendente** (a peça que falta). Uma aba
   "Atendimento":
   - lista de `whatsapp_conversations` com última mensagem + selo do modo
     (IA / humano);
   - abrir uma conversa mostra o histórico de `whatsapp_messages`;
   - botão "Assumir" → chama `rpc_transfer_to_human`;
   - caixa de texto para responder → precisa de uma Edge Function nova
     (`whatsapp-send`), porque o front **não pode** guardar o token do
     WhatsApp.

   ~1–2 dias de trabalho. Alternativa: usar a inbox de um BSP, ou subir um
   Chatwoot e ligar no mesmo número.

2. **Mostrar as notificações internas.** `transferToHuman` insere em
   `notifications`, mas nada no app mostra isso. Um sininho com contador.

3. Rodar migrações `06` + `07` + `08`, publicar as 2 Edge Functions, criar o
   usuário "Bot WhatsApp", configurar os secrets — passo a passo em
   `WHATSAPP.md` e `SETUP.md`.

### 4.5 Ordem recomendada

**Fase 0 — antes do WhatsApp (1–2 semanas)**
- [ ] Usar o app numa operação real, viagem por viagem (dogfooding).
- [ ] Preencher a tela Equipe com nomes/telefones reais.
- [ ] Ligar leaked-password protection.
- [ ] Ligar branch protection na `main`.
- [ ] Corrigir as 3 funções expostas ao `anon` (§3.1-C).
- [ ] Decidir e aplicar checagem de papel nas RPCs de escrita (§3.1-B).

**Fase 1 — fundação do WhatsApp (publicar o que já existe)**
- [ ] Meta: criar app, adicionar produto WhatsApp, **iniciar verificação da
      empresa** (CNPJ).
- [ ] Decidir o número: novo dedicado × migrar o comercial.
- [ ] Banco: ligar `pg_cron` + `pg_net`; criar usuário `bot@...` no Auth;
      rodar `06-whatsapp.sql`; editar e rodar `07-scheduling.sql`; rodar
      `08-realtime.sql` para as tabelas `whatsapp_*`.
- [ ] Edge Functions: `supabase functions deploy whatsapp-webhook` e
      `whatsapp-notifications-dispatcher`.
- [ ] Secrets: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
      `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `DISPATCH_SECRET`,
      `ANTHROPIC_API_KEY`.
- [ ] Templates: submeter `lembrete_viagem` e `motorista_a_caminho`;
      aguardar aprovação.
- [ ] Registrar o webhook na Meta, inscrever em `messages`.
- [ ] **Corrigir o bug de fuso** em `conversationEngine.ts` (§3.3-L).
- [ ] Rodar o checklist ponta-a-ponta do `WHATSAPP.md §6` num número de teste.

**Fase 2 — a caixa de entrada (em paralelo com os testes da Fase 1)**
- [ ] Construir a aba "Atendimento" **ou** subir Chatwoot / usar inbox de BSP.
- [ ] Rate limit por telefone no webhook (ex.: máx. 20 msg / 5 min) — evita
      flood de chamadas à API.

**Fase 3 — soft launch**
- [ ] Apontar o bot para o número real, mas deixar `attendance_mode = manual`
      nos primeiros dias (o bot **loga** as mensagens mas não responde).
- [ ] Ler as transcrições para ver o que os clientes realmente digitam.
- [ ] Virar para `ia` quando confiar. Manter um humano de olho na inbox por
      ~2 semanas.

**Fase 4 — observabilidade (issue #3)**
- [ ] Sentry: criar projeto, pôr `VITE_SENTRY_DSN` na Vercel.
- [ ] Alerta (e-mail/Sentry) em erro de Edge Function e em falha de cron.

---

## 5. Riscos por severidade

| Sev | Item | Ação |
|---|---|---|
| 🔴 Alto | App nunca operado de verdade — fluxo do dia não testado | Dogfooding 1–2 semanas (§3.1-A) |
| ~~🔴 Alto~~ ✅ | RPCs de escrita sem checagem de papel; autor forjável | **feito — PR #95** (§3.1-B) |
| ~~🟠 Médio~~ ✅ | 3 funções de trigger chamáveis sem login | **feito — PR #93** (§3.1-C) |
| 🟠 Médio | Sem rastreamento de erro em produção | Sentry DSN na Vercel (§3.2-F) |
| 🟠 Médio | WhatsApp: sem caixa de entrada do atendente | Construir aba Atendimento ou BSP (§4.4) |
| 🟡 Baixo | Cron sem monitoramento | Card de status na aba Sistema (§3.2-G) |
| 🟡 Baixo | Senha vazada / branch protection desligados | 2 cliques (§3.1-D/E) |
| 🟡 Baixo | Bug de fuso no bot (código não publicado) | Corrigir antes de publicar (§3.3-L) |
| ⚪ Débito | `App.jsx` monolítico (9,8 k linhas) | Extrair telas aos poucos (§3.3-J) |

---

## 6. O que dá para eu fazer agora

Posso implementar em PRs separados, na ordem que você preferir:

1. **Correções de segurança do banco** (§3.1-B + §3.1-C) — 1 migração,
   checagem de papel nas RPCs de escrita + revoke das funções internas.
2. **Card "Saúde do sistema"** na aba Sistema — última execução e status de
   cada cron job, com aviso em falha (§3.2-G).
3. **Aba "Atendimento"** — caixa de entrada de WhatsApp (lista de conversas,
   histórico, assumir, responder) + Edge Function `whatsapp-send`.
4. **Correção do fuso no `conversationEngine.ts`** + rate limit por telefone
   no webhook.
5. **Trocar o modelo do bot para Haiku 4.5** e medir (depois que houver
   tráfego real).

Os passos que **só você pode fazer** (contas externas): app na Meta,
verificação do CNPJ, escolha/migração do número, criar o projeto no Sentry,
ligar as proteções no painel do Supabase e do GitHub.
