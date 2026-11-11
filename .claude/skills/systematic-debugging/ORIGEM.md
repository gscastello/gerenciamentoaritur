# Origem e uso neste projeto

- **Fonte:** https://github.com/obra/superpowers/tree/22f0b46/skills/systematic-debugging (commit `22f0b46`, 10/11/2026)
- **Autor:** Jesse Vincent (obra/superpowers) · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #282): só instruções e documentação; nenhuma busca de instruções na internet.
- O `SKILL.md` e as referências estão como vieram, sem alterações. Para atualizar, baixe de novo da fonte,
  leia a diferença e troque os arquivos num PR.

## Neste projeto (o AGENTS.md vence em caso de conflito)

- Erros do bot: comece pelos logs da Edge Function (`query_logs`, `source='function_logs'`, eventos
  `bot_erro` / `bot_aviso`) e pelo banco, antes de mexer no código.
- Bug que envolve Agenda ou Reservas ganha label `critico` e **teste de regressão** cobrindo o caso (AGENTS.md §7).
- `find-polluter.sh` roda `npm test` arquivo por arquivo; no frontend use `npx vitest run <arquivo>`.
