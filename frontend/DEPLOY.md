# Deploy — Rota Pirapemas (frontend)

O app é um site estático (Vite + React). Deploy recomendado: **Vercel**
(config em `vercel.json`). Alternativa: **Netlify** (`netlify.toml`).

Pré-requisito: o código do `frontend/` precisa estar na branch que o host
vai buildar. Hoje ele está no PR #16 — **faça o merge do #16 na `main`
antes** (e depois o #17), ou aponte o deploy para a branch `chore/fundacao`.

---

## Vercel (recomendado)

1. Criar conta em https://vercel.com (login com o GitHub `gscastello`).
2. **Add New… → Project** → importar o repositório
   `gscastello/gerenciamentoaritur`.
3. Na tela de configuração do projeto:
   - **Root Directory:** `frontend`  ← importante, o app não está na raiz
   - **Framework Preset:** Vite (deve detectar sozinho)
   - Build Command / Output / Install: já vêm do `vercel.json`, não mexer
4. **Environment Variables** (aba Settings → Environment Variables, ou na
   própria tela de import) — adicionar para *Production* e *Preview*:

   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://szwnsacgpsvioswrelqo.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_UWKPnSaRmkowooT-WRn7Cw_8AEcnrUs` |
   | `VITE_OBSERVABILITY_ENV` | `production` |
   | `VITE_RELEASE` | *(opcional)* deixar vazio ou colar o SHA do commit |

   Sentry/Datadog/New Relic: só adicionar as chaves (`VITE_SENTRY_DSN`
   etc., ver `.env.example`) quando forem configurados na issue #3 — o app
   funciona sem elas.
5. **Deploy.** Em ~1 min sai a URL de produção
   (`https://<projeto>.vercel.app`).

Depois disso, **todo push na `main` faz deploy de produção** e **todo PR
ganha uma URL de preview** automaticamente — não precisa configurar mais
nada.

---

## Supabase — liberar a URL do app

Painel do Supabase → **Authentication → URL Configuration**:

- **Site URL:** a URL de produção da Vercel
- **Redirect URLs:** adicionar a URL de produção **e**
  `https://*-<seu-usuario>.vercel.app/**` (para os previews de PR)

Sem isso o login/signup redireciona errado.

---

## Netlify (alternativa)

1. Conta em https://netlify.com (login GitHub).
2. **Add new site → Import an existing project** → escolher o repo.
3. Config vem do `netlify.toml` (base `frontend`, publish `frontend/dist`).
   O SPA-fallback está em `frontend/public/_redirects`.
4. **Site settings → Environment variables:** as mesmas 3–4 variáveis da
   tabela acima.
5. Deploy.

---

## Observações

- Hoje o app roda em cima de `localStorage` (protótipo). As variáveis do
  Supabase são exigidas de fato quando a issue #10 ligar os
  services/hooks; configurá-las agora não atrapalha.
- A `anon key` acima é **publicável** — pode ir para o navegador. Quem
  protege os dados é o RLS do banco, não o sigilo da chave.
- O job `deploy` do GitHub Actions foi removido: o deploy é
  responsabilidade do host (Vercel/Netlify), o CI só roda os testes.
