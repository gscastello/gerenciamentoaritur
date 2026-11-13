# Origem e uso neste projeto

- **Fonte:** https://github.com/jakubkrehel/make-interfaces-feel-better/tree/35545ea/skills/make-interfaces-feel-better (commit `35545ea`, 13/11/2026)
- **Autor:** Jakub Krehel · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #381): instruções e documentação; nenhuma busca de instruções na internet a cada uso.
- Arquivos `.md` como vieram; `agents/openai.yaml` (configuração de outro agente) ficou de fora.
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
- É uma das três lentes de motion do AGENTS.md §5 (Jakub Krehel — polimento de entrada/saída).
