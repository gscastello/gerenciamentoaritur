# Origem e uso neste projeto

- **Fonte:** https://github.com/pbakaus/impeccable/tree/c4cd192/.claude/skills/impeccable (commit `c4cd192 (versão 4.9.0)`, 13/11/2026)
- **Autor:** Paul Bakaus (pbakaus/impeccable) · **Licença:** Apache-2.0 (ver `LICENSE`)
- **Lida antes de entrar** (issue #381): instruções e documentação; nenhuma busca de instruções na internet a cada uso.
- `SKILL.md` e `reference/` como vieram. **A pasta `scripts/` ficou de fora**: o launcher `impeccable` baixa um binário do GitHub na primeira vez que roda, e o AGENTS.md proíbe skill que busca coisa na internet a cada uso. Sem ele a skill usa o próprio modo "Launcher unavailable": lê PRODUCT.md/DESIGN.md direto e segue as referências. `pin`, `hooks`, `live` e `generate` (que dependem do launcher) não funcionam.
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
- A tela do app é modo **Operate** da própria skill: escaneável, consistente, sem `bolder`/`overdrive`/`delight` em tela de trabalho.
