# SETUP.md — o que falta para ir ao ar

Checklist mestre. Faça na ordem. Cada bloco aponta para o guia detalhado.

---

## ✅ Já feito (está no repositório)

- Schema completo do banco (`database/01`–`05`) + correções de segurança
  dos advisors (aplicadas no banco `gerenciamentoaritur projeto full` em
  31/08/2026 — `database/retrofit-security-hardening.sql`).
- Frontend Vite/React com build, lint, testes, CI e observabilidade
  (nos PRs [#16](https://github.com/gscastello/gerenciamentoaritur/pull/16)
  e [#17](https://github.com/gscastello/gerenciamentoaritur/pull/17)).
- Config de deploy (`frontend/vercel.json`, `frontend/DEPLOY.md`).
- Integração WhatsApp: migrações (`database/06`–`07`), Edge Functions
  (`supabase/functions/`), camada de NLU (`nluService.ts`), guia
  `WHATSAPP.md`.
- Issues #1–#15 criadas no GitHub.

---

## 🔴 Você precisa fazer — nesta ordem

### 1. Banco — rodar as migrações do WhatsApp

No **SQL Editor** do Supabase (projeto `gerenciamentoaritur projeto full`):

1. Habilitar extensões: **Database → Extensions** → ligar `pg_cron` e `pg_net`.
2. Criar o usuário do bot: **Authentication → Users → Add user**, e-mail
   `bot@rota-pirapemas.local` (ou outro — só ajuste o e-mail no topo do
   `06-whatsapp.sql` para bater).
3. Rodar `database/06-whatsapp.sql`.
4. Editar `database/07-scheduling.sql` — trocar `SEU-PROJETO` pela URL real
   das Edge Functions e `COLOQUE_O_MESMO_VALOR_DO_SECRET_AQUI` pelo
   `DISPATCH_SECRET` que você vai definir no passo 4. Depois rodar.
5. Rodar `database/08-realtime.sql` — publica as tabelas no Supabase
   Realtime (o painel atualiza sozinho entre atendentes).

> As extensões `citext`/`pg_trgm` continuam no schema `public` (WARN
> cosmético do advisor). Se quiser limpar: rode uma vez
> `alter extension citext set schema extensions; alter extension pg_trgm set schema extensions;`
> — se der erro de dependência, ignore.

### 2. Seu login de admin

1. **Authentication → Users → Add user** com o seu e-mail.
2. Como `auth.users` está vazio, o trigger `fn_handle_new_auth_user` te
   coloca como `admin` automaticamente. Confirme:
   ```sql
   select email, u.role from auth.users a join public.users u on u.id = a.id;
   ```
   Se não estiver `admin`:
   ```sql
   update public.users set role = 'admin'
   where id = (select id from auth.users order by created_at limit 1);
   ```

### 3. Frontend — deploy (Vercel)

Passo a passo completo em [`frontend/DEPLOY.md`](frontend/DEPLOY.md). Resumo:

1. **Merge o PR #16** na `main` (depois o #17).
2. Conta em vercel.com → **Add New Project** → importar o repo.
3. **Root Directory: `frontend`**.
4. Env vars (Production + Preview):
   ```
   VITE_SUPABASE_URL      = https://szwnsacgpsvioswrelqo.supabase.co
   VITE_SUPABASE_ANON_KEY  = sb_publishable_UWKPnSaRmkowooT-WRn7Cw_8AEcnrUs
   VITE_OBSERVABILITY_ENV  = production
   ```
5. Deploy → copiar a URL.
6. **Supabase → Authentication → URL Configuration**: colar a URL em
   *Site URL* e *Redirect URLs*.

### 4. WhatsApp — Chatwoot + Edge Function

Passo a passo completo em [`WHATSAPP.md`](WHATSAPP.md). Resumo:

1. Número conectado ao Chatwoot Cloud por Coexistência (feito em 2026-10-15).
2. Banco: `06-whatsapp.sql`, `50-base-conhecimento-bot.sql`, `51-bot-chatwoot.sql`
   (sem o `07` por enquanto) e o usuário `Bot WhatsApp` em Sistema → Equipe.
3. Deploy: `supabase functions deploy chatwoot-bot --no-verify-jwt`.
4. Secrets: `ANTHROPIC_API_KEY`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`,
   `CHATWOOT_API_TOKEN`, `CHATWOOT_WEBHOOK_SECRET` (nunca em chat/issue/PR).
5. Criar o Agent Bot no Chatwoot apontando pra
   `https://szwnsacgpsvioswrelqo.functions.supabase.co/chatwoot-bot` e ligá-lo à caixa.
6. Começar em modo **Sombra** e rodar o checklist do `WHATSAPP.md §7`.

---

## 🟡 Segurança / higiene

- **Revogar o Personal Access Token do GitHub** que foi colado no chat
  (`ghp_…1glfuo`) — GitHub → Settings → Developer settings → Personal
  access tokens. Ele já não está em nenhum arquivo, mas ficou no histórico
  da conversa.
- **Branch protection na `main`**: GitHub → Settings → Branches → exigir PR
  + CI verde + 1 review. (Os pushes diretos que fizemos foram exceções
  combinadas.)
- **Secrets do CI** (quando ligar Sentry/Codecov — issue #3):
  `CODECOV_TOKEN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `OTEL_*`, `DATADOG_*`
  em GitHub → Settings → Secrets and variables → Actions.

---

## 🔵 Depois (não bloqueia nada)

- Terminar a issue #10 — `src/app/App.jsx` ⇄ Supabase, aba por aba. A
  camada de auth e os services já estão prontos (branch
  `feature/10-app-supabase`); falta reescrever as abas. Plano detalhado
  em `docs/APP-INTEGRATION-PLAN.md`. Precisa do preview na Vercel rodando
  para testar.
- Job diário que cria as `trips` do dia (hoje o `rpc_create_reservation`
  cria sob demanda; a Agenda fica vazia em dias sem reserva) — ver
  `database/DATABASE.md §6`.
- Demais issues (#5–#15).
