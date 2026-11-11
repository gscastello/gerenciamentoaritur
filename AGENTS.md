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
`assistentePuro`, `pedidoDoCliente`, `confirmacaoAoCliente`),
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

**Skills do Claude em `.claude/skills/`** (issue #282) — carregadas sozinhas quando a tarefa pede:

| Skill | Para quê | Fonte |
|---|---|---|
| `agendar` | lançar no app reservas combinadas no WhatsApp | deste repositório |
| `vercel-react-best-practices` | desempenho em React (o app é Vite/SPA: regras `server-*` não valem) | vercel-labs/agent-skills (MIT) |
| `supabase-postgres-best-practices` | consultas, índices, RLS, migrações | supabase/agent-skills (MIT) |
| `systematic-debugging` | achar a causa antes de corrigir | obra/superpowers (MIT) |
| `verification-before-completion` | rodar e ler a verificação antes de dizer que terminou | obra/superpowers (MIT) |

Cada skill de fora traz `LICENSE` e `ORIGEM.md` (fonte, commit e o que muda neste projeto). Este AGENTS.md
vence em caso de conflito. Skill nova só entra **lida antes**, com licença que permita copiar e sem buscar
instruções na internet a cada uso.

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
  valor na tabela continua indo para a equipe; cidade fora da rota também.
- **Bairro sem preço** (issue #330, `database/96`): a tabela de bairros de São Luís foi completada pelo OpenStreetMap
  e pelas reservas, com o preço vazio até o dono preencher. Preço vazio **nunca vira R$ 0**: o bot devolve
  `BAIRRO_SEM_PRECO` (não diz valor; no Agendado fica "valor a confirmar") e o app mostra o campo vazio no topo de
  Sistema → Bairros. Nomes de cidades da rota (Matões, "Residencial Pirapemas") não entram como bairro.
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
  lança calado (pendente `conferir`). Regra nova que mexe na reserva não precisa de trava própria: a final pega.
  **Confirmação ao cliente** (issue #310, `confirmacaoAoCliente.ts`): depois que o Agendado lança, o bot manda ao
  cliente o resumo (sentido, dia, embarque, desembarque, quantidade; **nunca valor**, nunca o nome do perfil) e pede o
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
  mensagem ao cliente. **Sabe o que o Claude Code sabe** (issue #295): recebe os dados do sistema e a base de
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
  fica na lista com o motivo. Vale em qualquer modo, **inclusive no sombra** (dono, 10/11). O Agendado **reserva como está** (dono, 10/11): sem endereço a
  vaga entra só com o nome, "Endereço a confirmar" e sem valor na Ida; Volta sem cidade usa a base de lugares ou o
  costume, senão fica pendente; "ida e volta" sem o dia da volta lança a Volta no mesmo dia marcada para confirmar. **"Hoje" dito pelo cliente nunca vira amanhã calado** (issue #307): se a viagem daquele sentido já saiu e o
  destino existe na do outro sentido (cidades do caminho, como Miranda), é a do outro sentido hoje; senão fica pendente. Quando
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
- **Deploy de Edge Function**: desde 2026-11-11 o dono autorizou o agente a publicar
  sozinho, sem pedir a cada vez (issue #293). Antes, `deno check` da versão enviada ao
  GitHub (o deploy importa o commit pelo SHA); depois, conferir que a função responde
  (GET 405, sem assinatura/login 401) e contar ao dono o que foi publicado.
- **Secrets e criar o Agent Bot** continuam **manuais e autorizados pelo dono**, um a um.
- Secrets nunca vão em chat, issue ou PR.

Ao pegar uma tarefa nova que não tem Issue: **crie a Issue primeiro**
(template `Tarefa`), depois o branch `tipo/numero-slug`, depois o PR com
`Closes #N`.
