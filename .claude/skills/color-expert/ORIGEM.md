# Origem e uso neste projeto

- **Fonte:** https://github.com/meodai/skill.color-expert/tree/5bf7c77 (commit `5bf7c77`, 13/11/2026)
- **Autor:** David Aerne (meodai) · **Licença:** CC BY 4.0 (ver `LICENSE`) — exige dar crédito ao autor; este arquivo é o crédito
- **Lida antes de entrar** (issue #381): instruções e documentação; nenhuma busca de instruções na internet a cada uso.
- `SKILL.md` e `references/` como vieram; `evals/`, `CLAUDE.md`, `MAINTENANCE.md` e `README.md` ficaram de fora.
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
- Cores do app são os tokens `C` (claro/escuro). Mudar paleta é decisão do dono, com contraste WCAG/APCA conferido.
