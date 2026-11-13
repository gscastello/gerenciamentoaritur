# Origem e uso neste projeto

- **Fonte:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/6ae86f6/.claude/skills/ui-ux-pro-max (commit `6ae86f6`, 13/11/2026)
- **Autor:** Next Level Builder · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #381): instruções e documentação; nenhuma busca de instruções na internet a cada uso.
- `SKILL.md`, `references/`, `data/` e `scripts/*.py` como vieram; `scripts/tests/` ficou de fora. Os scripts só leem os CSV locais (sem rede). **Não foram executados nesta máquina** na instalação.
- Para atualizar: baixe de novo da fonte, leia a diferença e troque os arquivos num PR.

## Neste projeto (o AGENTS.md vence em caso de conflito)

- O app é uma ferramenta de **operação** (Agenda, reservas, financeiro, frota) usada no celular pela equipe:
  clareza, rapidez e padrão conhecido valem mais que efeito. Telas em **português**.
- Use o sistema que já existe: tokens de cor `C` em `frontend/src/app/tabShared.jsx`, componentes de `ui/` e
  o sistema de movimento de `ui/motion/` (`Skeleton`, `FadeIn`, `Stagger`, `Presence`, `ProgressBar`,
  `Spinner`, `useReducedMotion`) — AGENTS.md §5. Não traga biblioteca nova de UI ou de animação sem issue.
- Movimento: `fast 120ms` / `base 240ms` / `slow 360ms`, entrada `--ease-out-quart`, saída `--ease-in`;
  **`prefers-reduced-motion` sempre**; nada de animação decorativa. Toda tela nova ou alterada passa no
  checklist de motion (§5).
- Tailwind 3 + Vite (sem Next.js, sem shadcn/ui instalado). Mudança visual passa pelo fluxo normal:
  issue → branch → PR com e2e.
- No `SKILL.md`, troque `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max` por `.claude/skills/ui-ux-pro-max` (aqui é skill do projeto, não plugin): `python .claude/skills/ui-ux-pro-max/scripts/search.py "<busca>"`.
- Estilos, paletas e fontes sugeridos são **referência**: o app mantém a identidade AriTur e os tokens atuais.
