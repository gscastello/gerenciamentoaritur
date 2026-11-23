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
`opcoes`, `botGuard`, `chatwootSignature`, `chatwootPayload`, `dataOperacao`, `agentePuro`, `grafia`, `conversaPura`,
`assistentePuro`, `pedidoDoCliente`, `confirmacaoAoCliente`, `comprovantePuro`, `documentoPuro`, `lembretePuro`, `sentinelaPura`, `provaPura`),
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

**Skills e MCP** (`.claude/skills/`, `.mcp.json`): lista, origem e regras em `docs/regras/skills.md`. Skill nova só
entra **lida antes**, com licença que permita copiar e sem buscar instruções na internet a cada uso. Este AGENTS.md
vence em caso de conflito.

> `src/app/App.jsx` (o protótipo) está **temporariamente fora** do Biome e
> do Knip — é código denso legado que entra na régua durante a migração
> para services/hooks (issue #10). Todo arquivo novo entra normal.

**Superpowers e gasto de tokens** (dono, 23/11 — issue #496): as skills do plugin só valem para mudança de código que
peça (bug difícil, função nova). Em agendar, cancelar, ver pendências, consultas, textos e ajustes pequenos **não** use:
este arquivo vence o "use sempre". Nada de subagentes sem o dono pedir. Conversa nova por assunto; saída de comando e de
consulta enxuta (só as colunas e linhas necessárias); não reler o que já está na conversa; evento de CI sem ação
(comentário da Vercel, PR fechado) = resposta de uma linha, sem ferramentas.

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

**Visual aprovado pelo dono**: `docs/regras/visual.md` (cores, letra, topo, barra, mapa dos lugares, artes). Leia antes
de mexer em qualquer tela. Toque em todo botão (`btn-press`/`toque-at`); nada sai da tela de 320 a 430 px; sem rótulo
em maiúsculas; o Início não muda sem o dono pedir.

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

Detalhe em `docs/regras/dados.md` — leia inteiro antes de mexer em reserva, lista, offline, comprovante ou rota.

- Fonte de verdade = Postgres (`database/DATABASE.md`). Toda criação de reserva é **transacional e idempotente**
  (`wa_message_id`); telefone sempre normalizado (`fn_normalizar_telefone`), com e sem o nono dígito.
- Cancelamento é `UPDATE status`, **nunca `DELETE`**. Sem internet, a cópia é só para **ler**.
- **Lista que pode passar de 1.000 linhas** usa `buscarTodasAsPaginas` com ordem estável; o Supabase corta em 1.000 sem
  erro. Nada de dado incompleto ou velho calado (guarda de listas, releitura do tempo real).
- Comprovante Pix só dá baixa com tudo conferido; qualquer dúvida vira pendência.
- Tabela nova sem grant para `anon`; RPC `security definer` confere o papel (`fn_has_role`) e usa `auth.uid()`.

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

Detalhe em `docs/regras/bot.md` — **leia inteiro antes de mexer** em `supabase/functions/`, no leitor do Agendado, no
revisor, na sentinela, nos avisos, no assistente ou em regra de agendamento. Operação do Chatwoot em `WHATSAPP.md`. Regra
de operação combinada com o dono entra em `docs/regras/bot.md` e em `CONHECIMENTO_DA_OPERACAO`.

**Nunca pode ser quebrado:**

- **Meta 99,9%**: um erro faz o passageiro perder a viagem. Nenhuma mudança no leitor do Agendado é publicada sem a
  rodada COMPLETA de avaliação sem erro novo (`feitos = ativos`); auto-merge só depois dela. Uma frase nas instruções
  muda tudo: prefira regra em código. Diferença → repetir o caso 5 vezes na versão nova e na antiga antes de chamar de
  variação. Todo erro relatado vira caso. Publique de um commit com tudo o que já está no ar.
- **O bot não decide preço, vaga nem horário**: vêm do banco na hora (`calcular_valor`, `rpc_create_reservation`).
  Preço vazio nunca vira R$ 0; encomenda nunca recebe valor; número que não veio de ferramenta barra a resposta.
- **Nunca cadastra o nome do perfil do WhatsApp** nem expõe dados de outro passageiro.
- **Sentido pela ordem das paradas**: Ida = São Luís → Bacabeira → Santa Rita → Entroncamento → Miranda → Matões →
  Cantanhede → Campestre → Pirapemas; Volta = o contrário. A cidade da Volta só vale se dita (ou costume): nunca sai do
  nome da rua, que se repete. "Hoje" nunca vira amanhã calado.
- **Correção sozinha só com prova literal** na conversa; o que uma pessoa mudou à mão vence a conversa anterior. O
  revisor só cancela com todas as travas de `decidirCancelamentos`. Dúvida vira pendência ou pergunta, nunca reserva.
- **Mensagem ao cliente fora do modo `ia`**: só a confirmação do Agendado, a atualização/cancelamento do revisor, a
  pergunta de dúvida e o lembrete, autorizados pelo dono. O resto só se ele pedir, com o texto dele.
- **Agendado que não lançou não fica calado** (nota, faixa vermelha, pendência). Lição aprendida nunca vira preço,
  horário ou confirmação.
- **Cache das instruções**: nada que muda por conversa ou por hora na parte fixa, e a ordem do texto não muda.

**Onde está o quê em `docs/regras/bot.md`:** modos e transferência · cidades intermediárias e sentido · bairro sem preço e
Posto Carone · atendente conversacional · cliente recorrente e costume · preço · cidade da Volta e lugares · conferências ·
confirmação ao cliente · revisor e cancelamento · erros de escrita · assistente e Siri · reservas preparadas e "Agendado
☑️" · aprendizado · acerto e banco de casos · camadas de segurança (áudio, voto, cache, sentinela, pendências,
transcrição) · avisos e lembrete · dados na marca.

---

## 9. Operação, frota e números

Detalhe em `docs/regras/operacao.md` — leia antes de mexer em Início, Passageiros, Frota, veículo da viagem, Extrato ou
Fechamento. Uma conta só no banco para os números (`rpc_numeros_do_financeiro`); os lugares são os da **viagem do dia**
(`capacidadeDaViagem`), nunca os do veículo padrão; nada do extrato é apagado nem lançado duas vezes.

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
- **Deploy de Edge Function**: desde 2026-11-11 o dono autorizou o agente a publicar
  sozinho, sem pedir a cada vez (issue #293). Antes, `deno check` da versão enviada ao
  GitHub (o deploy importa o commit pelo SHA); depois, conferir que a função responde
  (GET 405, sem assinatura/login 401) e contar ao dono o que foi publicado.
- **Secrets e criar o Agent Bot** continuam **manuais e autorizados pelo dono**, um a um.
- Secrets nunca vão em chat, issue ou PR.

Ao pegar uma tarefa nova que não tem Issue: **crie a Issue primeiro**
(template `Tarefa`), depois o branch `tipo/numero-slug`, depois o PR com
`Closes #N`.
