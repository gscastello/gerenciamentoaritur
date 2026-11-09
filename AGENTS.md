# AGENTS.md — Rota Pirapemas (padrão do projeto)

Este arquivo define como **qualquer agente** (Claude, Copilot, Cursor,
Gemini, etc.) ou pessoa deve trabalhar neste repositório. É a fonte de
verdade do processo. Leia inteiro antes de abrir uma Issue, um branch ou
um PR. Se uma instrução daqui conflitar com um hábito seu, a instrução
daqui vence.

> **Escopo do código:** o app vive em `frontend/` (a migração do protótipo
> para services/hooks conectados ao Supabase terminou — issue #10). O banco
> está em `database/` (rodar os `.sql` na ordem numérica). O bot de WhatsApp
> vive em `supabase/functions/` (Edge Functions em Deno, via Chatwoot — ver
> `WHATSAPP.md`).

---

## 0. Resumo executável (Definition of Done)

Um PR só pode ser mesclado quando, rodando em `frontend/`:

```bash
npm ci
npm run lint          # Biome (lint + format)
npm run knip          # sem código / export / dependência morta
npm run arch          # contrato de arquitetura (dependency-cruiser)
npm run test          # Vitest + cobertura (gate no vite.config.js)
npm run test:mutation # Stryker (só exigido se tocou src/domain)
npm run test:e2e      # Playwright (fluxos afetados)
npm run build         # Vite
```

Se o PR tocou em `supabase/functions/` (bot de WhatsApp), na raiz do repo:

```bash
deno check supabase/functions/chatwoot-bot/index.ts
deno test supabase/functions/_shared   # módulos puros: assinatura, payload, opções, trava de números…
```

Tudo isso roda no CI (`.github/workflows/ci.yml`) em todo PR. **Merge
bloqueado** se qualquer job falhar. **O deploy é do host** (Vercel/Netlify,
via integração Git): push na `main` → produção, cada PR → preview. Nunca
por push direto na `main`. Ver `frontend/DEPLOY.md`.

Além disso, toda tela nova ou alterada precisa passar no **checklist de
motion (§5)** e toda função crítica alterada precisa emitir **evento de
observabilidade nomeado (§4)**.

---

## 1. Fluxo de trabalho: Issue → Branch → PR

1. **Toda tarefa nasce como Issue.** Classifique com UM label de tipo:
   - `bug` — Correção
   - `enhancement` — Melhoria de algo existente
   - `feature` — Nova função

   Labels extras quando fizer sentido: `critico`, `integracao`,
   `financeiro`, `seguranca`, `motion`, `observability`, `testing`,
   `chore`, `documentation`.

   Título curto no imperativo: `Corrigir cálculo de vagas na Volta`,
   `Adicionar filtro por motorista na Agenda`.

2. **Um branch por Issue**, nomeado `tipo/numero-slug`:
   `feature/42-checklist-embarque`, `fix/14-overbooking-edicao`.

3. **Commits pequenos e descritivos** — Conventional Commits validados por
   commitlint (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`,
   `perf:`, `ci:`, `build:`, `revert:`).

4. **O PR SEMPRE referencia a Issue** na descrição, com palavra-chave de
   fechamento automático:

   ```
   Closes #42
   ```

   Nunca abra um PR sem essa linha. Se resolve mais de uma Issue, liste
   todas: `Closes #42`, `Closes #47`. Se o PR só faz parte da Issue, use
   `Refs #42` e explique o que fica pendente.

5. **Descrição do PR** segue `.github/pull_request_template.md` (é
   carregado automaticamente). O checklist do template não é decorativo —
   marque de verdade.

6. **Deploy só acontece via merge do PR** na `main`. Merge por *squash*,
   mantendo o título da Issue no commit. Push direto na `main` é proibido
   (ligar branch protection: exigir PR + CI verde + 1 review).

---

## 2. Estrutura de `frontend/src/`

```
domain/         Regras puras: vagas, preços, diagnóstico, previsão de
                demanda, horários. SEM React, SEM I/O. 100% testável.
                Gate de cobertura reforçado. Fonte única — a UI e os
                services importam de domain/, nunca duplicam a regra.
services/       Acesso ao Supabase (I/O). Usa domain/. Não conhece React.
hooks/          Estado React (loading/error/retry/tempo real). Usa
                services/ + domain/.
observability/  Sentry + OpenTelemetry + RUM + eventos nomeados. Isolado.
ui/motion/      Sistema de movimento reutilizável (§5).
ui/             Demais componentes compartilhados.
app/            App.jsx e composição de telas. Usa hooks/ + domain/,
                NUNCA services/ direto.
lib/            supabaseClient (único), storageShim (dev).
```

O contrato acima é validado por `npm run arch`
(`.dependency-cruiser.cjs`). Quebrou o limite → o CI falha.

**Fora do frontend:** `supabase/functions/` são Edge Functions em Deno. `_shared/`
tem dois tipos de módulo: **puros** (sem `Deno.env`/rede — `telefone`,
`opcoes`, `botGuard`, `chatwootSignature`, `chatwootPayload`, `dataOperacao`, `agentePuro`),
que **precisam de teste** (`*.test.ts`) e rodam no CI (job *Funções (Deno)*); e
módulos com I/O (`whatsappService`, `chatwootClient`, `conversationEngine`…).
Regra de negócio testável vai pro módulo puro.

---

## 3. Qualidade de código

Nomes no AGENTS antigo → ferramenta real:

| Referência        | Ferramenta                | Config                       |
|-------------------|---------------------------|------------------------------|
| Biome             | `@biomejs/biome`          | `biome.json`                 |
| Comilint          | `@commitlint/cli`         | `commitlint.config.cjs`      |
| Knip              | `knip`                    | `knip.json`                  |
| Stryker / "Stryke"| `@stryker-mutator/core`   | `stryker.config.json`        |
| Arch-contract     | `dependency-cruiser`      | `.dependency-cruiser.cjs`    |

- **Biome** — lint + format único (substitui ESLint/Prettier). Inclui
  regras de acessibilidade.
- **commitlint** — convenção de commits (hook `commit-msg` do lefthook).
- **Knip** — detecta código/exports/dependências mortas.
- **Stryker** — mutation testing: valida que os testes de `src/domain`
  realmente pegam regressão (score mínimo `break: 75`).
- **dependency-cruiser** — valida os limites de arquitetura do §2
  (ex.: `ui/` não importa `services/` direto; `financeiro` não depende de
  `whatsapp-bot/`).

Hooks de git via **lefthook** (`lefthook.yml`), instalados por
`npm run prepare`.

> `src/app/App.jsx` (o protótipo) está **temporariamente fora** do Biome e
> do Knip — é código denso legado que entra na régua durante a migração
> para services/hooks (issue #10). Todo arquivo novo entra normal.

---

## 4. Observabilidade

Camadas (todas no-op se a env correspondente não existir — ver
`frontend/.env.example` e `src/observability/`):

- **OpenTelemetry** — instrumentação base (traces + métricas), export
  OTLP/HTTP para o backend de sua escolha. `withSpan(name, fn)` envolve
  operação crítica.
- **Sentry** — erros de front (e futuramente back), com **release tagging
  por deploy** (`VITE_RELEASE` = SHA do commit no CI) e upload de source
  maps. O `ErrorBoundary` do app reporta via `reportError()`.
- **Datadog RUM** *ou* **New Relic Browser** — escolher **UM** para
  dashboards operacionais (latência do bot de WhatsApp, taxa de reservas
  confirmadas × recusadas por lotação, erros de webhook). Config presente
  para os dois; New Relic só liga se o Datadog estiver vazio.

**Regra dura:** toda função crítica (confirmação de reserva, cálculo de
vagas, webhook do WhatsApp, auto-correção do diagnóstico) emite um
**evento nomeado** via `emit()` / `instrument()` de
`src/observability/events.js` — não só `console.log`. Nomes canônicos em
`EVENTS`. No bot (Deno, `supabase/functions/`), que não importa o frontend, o
equivalente é uma **linha JSON nomeada** no log (`bot_mensagem_recebida`,
`bot_erro`…) até a issue #3 ligar Sentry/OTel lá.

---

## 5. Motion & UI

Seguir a skill de **motion principles** —
`github.com/kylezantos/design-principles` (três lentes: Emil Kowalski —
restrição/velocidade; Jakub Krehel — polimento de entrada/saída; Jhey
Tompkins — experimentação pontual). O sistema reutilizável está em
`frontend/src/ui/motion/` (issue #2) — **use-o, não reinvente**:
`Skeleton`, `FadeIn`, `Stagger`, `Presence` (entrada **e** saída),
`LazyMount`, `Progress`, `useReducedMotion`.

Tokens: duração `fast 120ms` / `base 240ms` / `slow 360ms`; easing de
entrada `--ease-out-quart`, de saída `--ease-in`.

### Checklist obrigatório por tela (nova ou alterada)

- [ ] **Skeleton** no formato do conteúdo real enquanto carrega — nunca
      texto solto "carregando…", nunca layout shift.
- [ ] **Lazy-loading**: views pesadas (ex.: Dashboard/Recharts) via
      `React.lazy` + `Suspense` com fallback de skeleton.
- [ ] **Entrada**: conteúdo condicional aparece com transição (`FadeIn`
      / `Stagger`), nunca "pop" abrupto.
- [ ] **Saída**: modais, toasts, linhas removidas e alertas somem com
      transição (`Presence`), nunca desaparecem instantaneamente.
- [ ] **Carregamento / progresso**: botões em ação, uploads, steps de
      formulário e barras mostram estado com `Progress`.
- [ ] **`prefers-reduced-motion`** respeitado — **obrigatório, sem
      exceção**. `useReducedMotion` corta durações para ~0.
- [ ] Sem animação decorativa sem função (nada de `pulse` em elemento
      estático, nada de `hover-scale` em tudo).

E2E de motion (Playwright) cobre: skeleton antes do conteúdo; modal
anima entrada/saída; `prefers-reduced-motion` desliga transições.

---

## 6. Persistência de dados (reserva nunca pode se perder)

- Fonte de verdade em produção é o Postgres descrito em
  `database/DATABASE.md`, **não** o `storageShim`/localStorage (que é só
  para rodar o protótipo em dev).
- Toda criação de reserva é **transacional e idempotente** por
  `wa_message_id` (no bot, `cw-<id da mensagem no Chatwoot>`) — reenvio de
  webhook nunca duplica. O telefone do cliente é **sempre normalizado**
  (`fn_normalizar_telefone`: só dígitos, sem `+55`) e buscado também com/sem o
  nono dígito — senão o mesmo número vira dois clientes.
- Cancelamento é sempre `UPDATE status`, **nunca `DELETE`**.
- Backup diário automático no provedor + botão de backup manual (JSON) na
  aba Sistema.

---

## 7. Correção automática de bugs (prioridade: Agenda e Reservas)

- A aba **Sistema** roda `runDiagnostics` sob demanda: quantidade
  inválida (**autocorrige** para 1), overbooking, ponto de embarque
  inexistente, reserva sem telefone, ids duplicados. Só a quantidade é
  corrigida sozinha; o resto é **reportado**.
- Em produção, a mesma lógica vira job agendado (issue #9, ver
  `DATABASE.md §3`): grava achados em `auditoria` e dispara alerta via
  Sentry/Datadog. **Nunca** corrige uma reserva confirmada sem rastro
  auditável.
- Issue `bug` que envolva Agenda ou Reservas ganha label `critico` e
  **não pode ser mesclada sem teste de regressão** cobrindo o caso.

---

## 8. Flexibilidade IA ⇄ humano

O número de WhatsApp está no **Chatwoot Cloud** (Coexistência com o app do
celular); o bot é um Agent Bot (`chatwoot-bot`). Operação em `WHATSAPP.md`.

- Modo global em `settings.attendance_mode` (`ia` | `manual` | `sombra`),
  editável na aba Sistema e válido na hora para todos os sócios:
  - `ia` — o bot responde e confirma reservas sozinho;
  - `manual` — o bot não responde; a conversa aparece como Aberta no Chatwoot;
  - `sombra` — o bot roda tudo, mas a resposta vira **nota privada** e **nada é
    gravado** no negócio. Todo bot novo ou mudança grande começa em `sombra`.
- Por conversa: `whatsapp_conversations.attendance_mode` (`ia` | `humano`). O bot
  **continua ativo** quando a equipe responde pelo celular; só **cala** na
  transferência completa (`rpc_transfer_to_human` + status Aberta no Chatwoot).
  Devolver ao bot = status Pendente no Chatwoot.
- O botão/pedido "falar com atendente" funciona em qualquer modo e **sempre**
  transfere e abre uma pendência (aba Pendências) com o link da conversa.
- Reservas fora da área padrão (São Luís, Cantanhede, Pirapemas) entram
  como `pendente` e exigem confirmação manual — nunca vão sozinhas para a
  Agenda.
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
- A fila de atendimento fica na aba **Atendimento** (espelho do Chatwoot).
- **Reservas preparadas pela IA** (issue #254, `WHATSAPP.md §6e`): quando a equipe atende, o bot lê a conversa e, com
  **data + endereço ou ponto**, deixa um rascunho em `reservation_drafts`. A equipe lança com um toque (preço e vaga
  pelo app); criar a reserva por qualquer caminho fecha o rascunho. A IA nunca reserva nem decide preço por aqui.
- **O bot aprende o tempo todo, em qualquer modo** (`ia`, `manual` ou `sombra`): é o treino
  para o modo automático futuro e **nunca deve estagnar** (issue #218, `WHATSAPP.md §6b`).
  Observa só texto (90 dias), gera lições sem nomes/telefones e uma anotação por cliente
  recorrente. **Aprende só com o atendente** (o que o próprio bot escreveu não entra), em
  orientações gerais e casos isolados aplicáveis, nunca roteiro, menu ou formulário fixo; o que o
  dono retirou não volta sozinho (issue #232). Linguagem/estilo/fluxo/situação/operação valem na hora com
  aviso; fato e negócio (inclusive valor de trecho) só aprovados, e operação que cite dinheiro também. Lição já revisada nunca é
  reescrita sozinha: o bot deixa uma sugestão de atualização para o dono aceitar ou manter. Mudança no aprendizado não pode quebrar essas
  garantias (nem fazer o bot decidir preço, vaga, horário ou confirmação).

---

## 9. IA Operacional e previsão de demanda

- O Dashboard calcula client-side (sem custo de API) alertas operacionais
  a cada carregamento: lotação por viagem, pendências, pagamentos em
  aberto, manutenção próxima do vencimento, consumo de combustível
  anômalo, lista de espera.
- Previsão de demanda = média histórica simples por dia da semana
  (`domain/demanda.js`). Ao crescer o volume, considerar série temporal
  real (Prophet, ou chamada à API do Claude com dados agregados).

---

## 10. Encomendas

- "Enviar uma encomenda" **nunca** informa valor automaticamente — sempre
  encerra em atendimento humano. No banco: `reservas.tipo = 'encomenda'`
  nunca tem `valor_total` preenchido pelo bot.

---

## 11. Estado do processo (GitHub)

As Issues do backlog inicial **já foram criadas** (#1 a #15). O
mapeamento e o texto pronto estão em `docs/ISSUES-INICIAIS.md`. Labels
customizados (`feature`, `critico`, `integracao`, `financeiro`,
`seguranca`, `motion`, `observability`, `testing`, `chore`) já existem no
repositório.

**WhatsApp:** número no Chatwoot por Coexistência desde 2026-10-15; bot e painel
seguem o `WHATSAPP.md` (issue #163).

**Ações em produção:**
- **Migrações** (`database/NN-*.sql`): desde 2026-11-09 o dono autorizou o agente a
  aplicá-las sozinho, sem pedir a cada uma (issue #250). Antes de aplicar, confira no
  banco o que a migração troca (trecho de função esperado, colunas, dados afetados) e
  teste o que der sem gravar (`raise exception` para desfazer). Depois, verifique o
  efeito e conte ao dono o que foi aplicado. A migração continua indo num PR com
  `Closes #N`, como qualquer mudança.
- **Deploy de Edge Function, secrets e criar o Agent Bot** continuam **manuais e
  autorizados pelo dono**, um a um.
- Secrets nunca vão em chat, issue ou PR.

Ao pegar uma tarefa nova que não tem Issue: **crie a Issue primeiro**
(template `Tarefa`), depois o branch `tipo/numero-slug`, depois o PR com
`Closes #N`.
