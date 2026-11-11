# Origem e uso neste projeto

- **Fonte:** https://github.com/obra/superpowers/tree/22f0b46/skills/verification-before-completion (commit `22f0b46`, 10/11/2026)
- **Autor:** Jesse Vincent (obra/superpowers) · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #282): só instruções e documentação; nenhuma busca de instruções na internet.
- O `SKILL.md` e as referências estão como vieram, sem alterações. Para atualizar, baixe de novo da fonte,
  leia a diferença e troque os arquivos num PR.

## Neste projeto (o AGENTS.md vence em caso de conflito)

- "Verificado" aqui = os comandos do AGENTS.md §0 rodados de novo e lidos: no frontend `npm run check:all`
  (e `npx playwright test` quando mexer em tela); no bot `deno check supabase/functions/chatwoot-bot/index.ts
  supabase/functions/bot-aprender/index.ts` e `deno test supabase/functions/_shared`.
- Depois de publicar uma função: `GET` = 405 e `POST` sem assinatura = 401 antes de dizer que está no ar.
- O relatório ao dono é **em português** (ele não lê inglês) e diz o que foi verificado e o que não foi.
