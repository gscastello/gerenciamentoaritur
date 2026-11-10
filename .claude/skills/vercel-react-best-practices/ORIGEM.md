# Origem e uso neste projeto

- **Fonte:** https://github.com/vercel-labs/agent-skills/tree/1a2c79d/skills/react-best-practices (commit `1a2c79d`, 10/11/2026)
- **Autor:** Vercel · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #282): só instruções e documentação; nenhuma busca de instruções na internet.
- O `SKILL.md` e as referências estão como vieram, sem alterações. Para atualizar, baixe de novo da fonte,
  leia a diferença e troque os arquivos num PR.

## Neste projeto (o AGENTS.md vence em caso de conflito)

- O app é **React + Vite (SPA)**, não Next.js: as regras `server-*` (Server Components, Server Actions,
  `after`, rotas de API do Next) **não se aplicam**. Valem as de bundle, re-render, rendering, JS e as `async-*`.
- Views pesadas já vão por `React.lazy` + `Suspense` (AGENTS.md §5); use estas regras para decidir o que mais
  carregar sob demanda, nunca para remover o sistema de motion (`ui/motion/`).
- Toda mudança continua passando pelo Definition of Done do AGENTS.md §0 (`npm run check:all`, e2e).
