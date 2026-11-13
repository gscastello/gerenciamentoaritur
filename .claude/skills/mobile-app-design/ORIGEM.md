# Origem e uso neste projeto

- **Fonte:** https://github.com/awesome-skills/mobile-app-design/tree/83e4721 (commit `83e4721`, 13/11/2026)
- **Autor:** awesome-skills · **Licença:** MIT, **declarada no README** da fonte (o repositório não tem arquivo LICENSE; ver `LICENSE` aqui)
- **Lida antes de entrar** (issue #381): instruções e documentação; nenhuma busca de instruções na internet a cada uso.
- `SKILL.md`, `references/` e `examples/` como vieram. **`scripts/` ficou de fora** (shell/python de auditoria; a menção a eles no `SKILL.md` não vale aqui).
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
- O app é PWA (web no celular), não React Native: use as regras de toque, acessibilidade e convenção; ignore as de bibliotecas nativas.
