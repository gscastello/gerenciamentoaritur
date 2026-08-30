# AGENTS.md — Rota Pirapemas (padrão do projeto)

Este arquivo define como QUALQUER agente (Claude, Copilot, Cursor, etc.) ou
pessoa deve trabalhar neste repositório. Leia antes de abrir uma Issue, um
branch ou um PR.

## 1. Fluxo de trabalho: Issue → Branch → PR

1. **Toda tarefa nasce como Issue.** Classifique com um label:
   - `bug` — Correção
   - `enhancement` — Melhoria de algo existente
   - `feature` — Nova função
   Título curto no imperativo: `Corrigir cálculo de vagas na Volta`,
   `Adicionar filtro por motorista na Agenda`.
2. **Um branch por Issue**, nomeado `tipo/numero-slug`, ex.: `feature/42-checklist-embarque`.
3. **Commits pequenos e descritivos** (Conventional Commits: `fix:`, `feat:`, `chore:`, `test:`).
4. **PR sempre referencia a Issue** na descrição, usando palavra-chave de
   fechamento automático:
   ```
   Closes #42
   ```
   O PR nunca é aberto sem essa referência. Se resolver mais de uma Issue,
   liste todas: `Closes #42, Closes #47`.
5. **Template mínimo de descrição de PR:**
   ```markdown
   ## O que muda
   ...
   ## Por quê
   ...
   Closes #<issue>
   ## Como testar
   ...
   ## Checklist
   - [ ] Lint (Biome) passando
   - [ ] Testes unitários/integração passando
   - [ ] Playwright (e2e) passando nos fluxos afetados
   - [ ] Sem regressão de acessibilidade/motion (prefers-reduced-motion respeitado)
   ```
6. **Deploy só acontece via merge do PR** na branch principal, nunca por
   push direto. Merges usam squash, mantendo o título da Issue no commit.

## 2. Qualidade de código

- **Biome** — lint + format único (substitui ESLint/Prettier).
- **Comilint** — convenção de commits.
- **Knip** — detecta código/exports/dependências mortas.
- **Stryker (Stryke)** — mutation testing para validar a força dos testes.
- **Arch-contract** — valida limites de arquitetura (ex.: UI não importa
  direto de `storage/`, `financeiro/` não depende de `whatsapp-bot/`).

Todos rodam no CI antes de qualquer merge ser permitido.

## 3. Testes

- **Unitários/integração**: cobrindo cálculo de vagas por viagem (não por
  ponto de embarque), preço por ponto/quantidade, ajuste de segunda-feira,
  troca de veículo (ônibus 31 / van 14).
- **End-to-end (Playwright)**: fluxo completo do cliente (data → viagem →
  embarque → dados → pagamento → confirmação) e fluxo do motorista
  (marcar embarcado, ver quem falta).
- **Codecov**: cobertura mínima definida por PR; PR que reduz cobertura
  crítica (motor de vagas, financeiro) é bloqueado.

## 4. Observabilidade

- **OpenTelemetry** como camada de instrumentação (traces + métricas),
  exportando para o backend de sua escolha.
- **Sentry** para captura de erros de front e back, com release tagging por
  PR/deploy.
- **Datadog** ou **New Relic** (escolher um) para dashboards operacionais
  (latência do bot de WhatsApp, taxa de reservas confirmadas x recusadas
  por lotação, erros de webhook).
- Toda função crítica (confirmação de reserva, cálculo de vagas, webhook do
  WhatsApp) deve emitir um evento nomeado, não só logs soltos.

## 5. Motion & UI

Seguir a skill `kylezantos/design-motion-principles` (três lentes: Emil
Kowalski — restrição/velocidade, Jakub Krehel — polimento de
entrada/saída, Jhey Tompkins — experimentação pontual):

- Toda mudança de estado condicional (lista, modal, tab) precisa de
  transição de entrada/saída — nunca aparecer/sumir abruptamente.
- Skeleton + shimmer em qualquer carregamento assíncrono (nunca texto
  solto tipo "carregando...").
- `prefers-reduced-motion` sempre respeitado — obrigatório, sem exceção.
- Sem animação decorativa sem função (nada de "pulse" em elementos
  estáticos, nada de hover-scale em tudo).

## 6. Persistência de dados (reserva nunca pode se perder)

- Fonte de verdade em produção é o Postgres descrito em `DATABASE.md`,
  não o storage do artefato (que é só para prototipagem no chat).
- Toda criação de reserva é transacional e idempotente por
  `wa_message_id` — reenvio de webhook do WhatsApp nunca duplica.
- Cancelamento é sempre `UPDATE status`, nunca `DELETE`.
- Backup diário automático no provedor + botão de backup manual (JSON)
  disponível na aba Sistema do painel.

## 7. Correção automática de bugs (prioridade: Agenda e Reservas)

- A aba **Sistema** do app roda um diagnóstico sob demanda: detecta
  quantidade inválida (autocorrige), overbooking, reserva com ponto de
  embarque inexistente, reserva sem telefone, ids duplicados.
- Em produção, a mesma lógica vira um job agendado (ver `DATABASE.md`
  §3) que grava qualquer achado em `auditoria` e dispara alerta via
  Sentry/Datadog — nunca corrige uma reserva confirmada sem deixar
  rastro auditável.
- Toda Issue de tipo `bug` que envolva Agenda ou Reservas é tratada como
  prioridade máxima (label extra `crítico`) e não pode ser mesclada sem
  teste de regressão cobrindo o caso.

## 8. Flexibilidade IA ⇄ humano

- Flag `modo_atendimento` (`ia` | `manual`) em `configuracao`, editável
  no painel (aba Sistema). O bot do WhatsApp consulta essa flag antes de
  responder automaticamente.
- Em modo `manual`, o bot para de confirmar reservas sozinho; a equipe
  assume a conversa. O botão "falar com atendente" no fluxo do cliente
  funciona em qualquer modo e sempre cria um item de acompanhamento
  humano (nunca fica só na conversa).
- Reservas em cidades fora da área padrão (São Luís, Cantanhede,
  Pirapemas) entram como `pendente` e exigem confirmação manual — nunca
  são lançadas automaticamente na Agenda.

## 9. IA Operacional e previsão de demanda

- O painel calcula sozinho (client-side, sem custo de API extra) um
  conjunto de alertas operacionais a cada carregamento do Dashboard:
  lotação por viagem, pendências, pagamentos em aberto, manutenção
  próxima do vencimento, consumo de combustível anômalo e lista de
  espera — mesma lógica que futuramente pode virar um job de backend
  publicando no WhatsApp interno do dono.
- A previsão de demanda por dia da semana é uma média histórica simples
  (passageiros confirmados por data, agrupados por dia da semana). Ao
  crescer o volume de dados, considerar trocar por um modelo de série
  temporal real (ex.: Prophet, ou uma chamada à API do Claude com os
  dados agregados) — a Issue correspondente já está listada.

## 10. Encomendas

- Fluxo de "Enviar uma encomenda" nunca informa valor automaticamente —
  sempre encerra em atendimento humano. Ao persistir em banco real,
  aplicar a mesma regra: `reservas.tipo = 'encomenda'` nunca deve ter
  `valor_total` preenchido pelo bot.

## 11. Limites conhecidos deste ambiente

Este documento e o protótipo funcional (`rota-pirapemas-app.jsx`) foram
gerados num ambiente sem acesso à internet e sem conector de GitHub
disponível na minha lista de ferramentas — por isso as Issues em
`ISSUES-INICIAIS.md` estão redigidas prontas para colar, com os comandos
`gh` exatos, mas não foram criadas automaticamente no repositório real.
O mesmo vale para CI real, Sentry/Datadog/OTel conectados e testes
rodando de fato: preciso que o conector de GitHub apareça disponível
nesta conversa (ou que você rode os comandos localmente) para eu — ou
você — executar isso de verdade em vez de apenas descrever.
