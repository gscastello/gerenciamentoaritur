# Rota Pirapemas — Sistema de gestão (São Luís ⇄ Pirapemas)

Sistema de agendamento, agenda operacional, financeiro e operação para
empresa de transporte, com backend PostgreSQL/Supabase e integração real
com WhatsApp Business API.

> **Vai colocar no ar?** Comece por [`SETUP.md`](SETUP.md) — o checklist
> mestre do que falta fazer, na ordem.

## Estrutura do repositório

```
.
├── database/
│   ├── DATABASE.md          # Arquitetura de dados, decisões e migração V2→V3
│   ├── 01-schema.sql        # Tabelas, enums, índices, triggers (rodar 1º)
│   ├── 02-rls-policies.sql  # Row Level Security por papel (rodar 2º)
│   ├── 03-rpc-functions.sql # Funções atômicas (criar/confirmar/mover reserva) (rodar 3º)
│   ├── 04-frontend-views.sql# View de leitura + índices de FK (rodar 4º)
│   ├── 05-seed.sql          # Veículos, pontos de embarque, bairros, config (rodar 5º)
│   ├── 06-whatsapp.sql      # Conversas/mensagens do WhatsApp + modo IA|HUMANO (rodar 6º)
│   ├── 07-scheduling.sql    # pg_cron: "motorista a caminho" + lembrete de viagem (rodar 7º)
│   ├── 08-realtime.sql      # Publica as tabelas de negócio no Supabase Realtime (rodar 8º)
│   ├── 09-daily-trips.sql   # pg_cron: cria Ida/Volta de cada dia (Agenda nunca vazia) (rodar 9º)
│   ├── 10-dropoff-plan.sql  # Campos de desembarque + RPCs p/ a rota do motorista (rodar 10º)
│   ├── 11-dropoff-on-create.sql # rpc_create_reservation grava dropoff_area/detail (rodar 11º)
│   ├── 12-write-guards.sql  # GRANT UPDATE por coluna + REVOKE DELETE (anti-adulteração) (rodar 12º)
│   ├── 15-fix-capacity-on-reservation-move.sql # Trigger de capacidade em reservations.trip_id (rodar 15º)
│   ├── 16-timezone-sao-luis.sql # Fuso do banco = America/Fortaleza (current_date/now()) (rodar 16º)
│   └── retrofit-security-hardening.sql # Correções dos advisors do Supabase —
│                             # rodar 1x só se o banco foi criado antes de 31/08/2026
├── supabase/functions/       # Edge Functions (backend real do WhatsApp — nunca no frontend)
│   ├── _shared/
│   │   ├── supabaseAdmin.ts      # cliente com service_role (só existe no servidor)
│   │   ├── whatsappClient.ts     # fala com a Graph API da Meta (texto/lista/botão/template)
│   │   ├── whatsappService.ts    # regras de negócio: nunca inventa vaga/preço/pagamento
│   │   ├── conversationEngine.ts # máquina de estados do atendimento (menus/botões)
│   │   └── nluService.ts        # interpreta texto livre (extração estruturada via Claude)
│   ├── whatsapp-webhook/         # recebe mensagens da Meta
│   └── whatsapp-notifications-dispatcher/  # envia lembretes e "motorista a caminho"
├── WHATSAPP.md               # guia de deploy da integração WhatsApp, passo a passo
├── SETUP.md                  # checklist mestre para ir ao ar
├── frontend/                # App (Vite + React). Ver AGENTS.md §2.
│   ├── package.json         # scripts: dev, build, lint, test, test:e2e…
│   ├── vercel.json          # Config de deploy (Vercel) — ver DEPLOY.md
│   ├── DEPLOY.md            # Passo a passo do deploy
│   ├── INTEGRATION.md       # O que foi criado/removido e como o fluxo de reserva funciona
│   ├── .env.example         # Variáveis de ambiente (Supabase, Sentry, OTel, RUM…)
│   ├── e2e/                 # Testes end-to-end (Playwright)
│   └── src/
│       ├── app/App.jsx      # Protótipo funcional — agenda, reservas, CRM,
│       │                      financeiro, operação, dashboard (migração p/
│       │                      services/hooks = issue #10)
│       ├── domain/          # Regras puras + testes (vagas, preços, diagnóstico)
│       ├── lib/             # Cliente Supabase único, storageShim (dev)
│       ├── services/        # 8 services (reservations, trips, customers, payments,
│       │                     finance, operation, vehicles, users)
│       ├── hooks/            # Hooks React (loading/error/retry/tempo real)
│       ├── observability/   # Sentry + OpenTelemetry + RUM + eventos nomeados
│       ├── ui/motion/       # Sistema de movimento reutilizável (issue #2)
│       └── INTEGRATION-EXAMPLE.jsx  # Exemplo real de integração (Reservar → Agenda)
├── docs/
│   └── ISSUES-INICIAIS.md   # Backlog inicial pronto para virar Issues do GitHub
└── AGENTS.md                 # Padrão de trabalho (Issues → PR, qualidade, observabilidade)
```

## Ordem de setup (do zero)

1. Criar um projeto no [Supabase](https://supabase.com).
2. No SQL Editor do projeto, rodar nesta ordem exata:
   `database/01-schema.sql` → `02-rls-policies.sql` → `03-rpc-functions.sql`
   → `04-frontend-views.sql` → `05-seed.sql`.
   Bancos criados antes de 31/08/2026 devem rodar também
   `database/retrofit-security-hardening.sql` (uma vez) para aplicar as
   correções de segurança dos advisors do Supabase.
3. Para a integração de WhatsApp: rodar `database/06-whatsapp.sql` →
   `07-scheduling.sql` e fazer o deploy das Edge Functions — passo a passo
   completo em `WHATSAPP.md`.
4. Copiar `frontend/.env.example` para `frontend/.env` e preencher com a
   URL e a `anon key` do projeto (Project Settings → API no Supabase).
5. Instalar e rodar o app:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
6. Antes de abrir um PR, rodar os gates (ver `AGENTS.md §0`):
   `npm run lint && npm run knip && npm run arch && npm run test && npm run build`.
7. Seguir `frontend/INTEGRATION.md` para trocar a persistência local do
   `src/app/App.jsx` pelos services/hooks de `frontend/src/`.

## Estado atual

- ✅ Protótipo funcional completo (agenda, reservas, financeiro, operação, CRM).
- ✅ Schema PostgreSQL normalizado, com RLS por papel e proteção de
  overbooking garantida por trigger no banco (não apenas no frontend).
- ✅ Camada de services/hooks pronta para conectar o frontend ao Supabase,
  com tempo real e retry seguro.
- ✅ Integração real com WhatsApp Business API (webhook + Edge Functions +
  máquina de estados + NLU), com auditoria de toda ação da IA e modo
  IA|HUMANO por conversa — ver `WHATSAPP.md`.
- ⏳ GPS/rastreamento contínuo de viagem — planejada, não iniciada.
- ⏳ Aplicar os hooks dentro de `src/app/App.jsx` aba por aba (o padrão já
  está demonstrado em `frontend/src/INTEGRATION-EXAMPLE.jsx`) — issue #10.
- 🏗️ Fundação de build/lint/testes/CI e observabilidade — em andamento
  (issues #1, #3, #4); sistema de motion unificado — issue #2.

Veja `AGENTS.md` para o padrão de Issues/PRs, qualidade, testes,
observabilidade e motion. O backlog está em `docs/ISSUES-INICIAIS.md` e
nas Issues #1–#15 do GitHub.
