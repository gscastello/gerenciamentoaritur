# Issues iniciais — criadas no GitHub

As Issues abaixo **já existem** no repositório
(`gscastello/gerenciamentoaritur`). Este arquivo é o mapa de referência;
o texto completo está em cada Issue.

## Infra / processo

| #  | Título                                                        | Labels                          |
|----|--------------------------------------------------------------|---------------------------------|
| 1  | chore: fundação do projeto frontend (build, lint, testes, CI) | `chore`                         |
| 2  | Sistema de movimento unificado em toda a interface            | `motion`, `enhancement`         |
| 3  | Instrumentar observabilidade: OpenTelemetry + Sentry + Datadog/New Relic | `observability`      |
| 4  | Suíte de testes: motor de vagas/preço + e2e Playwright + Codecov + Stryker | `testing`          |

## Produto / backlog

| #  | Título                                                        | Labels                                    |
|----|--------------------------------------------------------------|-------------------------------------------|
| 5  | Conectar bot de WhatsApp (WhatsApp Business API) ao motor de reservas | `feature`, `integracao`           |
| 6  | Detectar cidades intermediárias e criar fila de pendentes     | `feature`, `integracao`, `critico`        |
| 7  | Redirecionar pedidos de Frete para atendimento humano         | `feature`                                 |
| 8  | Webhook de comprovante Pix                                    | `feature`, `integracao`, `financeiro`     |
| 9  | Job agendado de diagnóstico e auto-correção (Agenda/Reservas) | `bug`, `critico`                          |
| 10 | Persistir reservas em Postgres (schema em DATABASE.md)        | `feature`, `critico`                      |
| 11 | Autenticação e papéis (dono / motorista / atendente)          | `enhancement`, `seguranca`                |
| 12 | Exportar relatório financeiro mensal/anual                    | `feature`, `financeiro`                   |
| 13 | Flag de modo de atendimento (IA ⇄ manual) lida pelo bot       | `feature`                                 |
| 14 | Validar overbooking também na edição manual de reserva        | `bug`, `critico`                          |
| 15 | Notificação automática da lista para o motorista              | `enhancement`                             |

## Como trabalhar cada uma

Ver `AGENTS.md`:
- §1 — Issue → branch `tipo/numero-slug` → PR com `Closes #N`.
- §0 — gates que o PR precisa passar.
- §5 — checklist de motion para qualquer tela tocada.

## Template de PR

Carregado automaticamente de `.github/pull_request_template.md`.
