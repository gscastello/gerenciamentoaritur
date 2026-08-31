# AGENTS.md — Rota Pirapemas (padrão do projeto)

Este arquivo define como **qualquer agente** (Claude, Copilot, Cursor,
Gemini, etc.) ou pessoa deve trabalhar neste repositório. É a fonte de
verdade do processo. Leia inteiro antes de abrir uma Issue, um branch ou
um PR. Se uma instrução daqui conflitar com um hábito seu, a instrução
daqui vence.

> **Escopo do código:** o app vive em `frontend/`. O protótipo funcional
> original está em `frontend/src/app/App.jsx` e está sendo migrado para os
> services/hooks conectados ao Supabase (issue #10). O banco está em
> `database/` (rodar os `.sql` na ordem numérica).

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
`EVENTS`.

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
  `wa_message_id` — reenvio de webhook do WhatsApp nunca duplica.
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

- Flag `modo_atendimento` (`ia` | `manual`) em `configuracao`, editável na
  aba Sistema. O bot consulta antes de responder automaticamente.
- Em `manual`, o bot para de confirmar reservas sozinho. O botão "falar
  com atendente" funciona em qualquer modo e **sempre** cria um item de
  acompanhamento humano.
- Reservas fora da área padrão (São Luís, Cantanhede, Pirapemas) entram
  como `pendente` e exigem confirmação manual — nunca vão sozinhas para a
  Agenda.

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

Ao pegar uma tarefa nova que não tem Issue: **crie a Issue primeiro**
(template `Tarefa`), depois o branch `tipo/numero-slug`, depois o PR com
`Closes #N`.
