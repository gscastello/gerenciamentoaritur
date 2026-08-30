# Sistema de movimento (`ui/motion`)

Fonte única do movimento da interface. **Não escreva `@keyframes` soltos
em componente** — importe daqui. Regras em `AGENTS.md §5`.

Baseado em `github.com/kylezantos/design-principles`, três lentes:

| Lente | Ideia | Como aparece aqui |
|-------|-------|-------------------|
| **Emil Kowalski** | Restrição e velocidade | durações 120/240/360ms; `Stagger` para no 6º item |
| **Jakub Krehel** | Polimento de entrada **e saída** | easings distintos (`--ease-out-quart` entra, `--ease-in` sai); `Presence` mantém o nó montado até a saída terminar |
| **Jhey Tompkins** | Experimentação pontual | animação só onde tem função; nada decorativo |

## API

```jsx
import {
  Skeleton, SkeletonText, SkeletonStat,
  FadeIn, Stagger, Presence, fadeScale, fadeSlideDown,
  LazyMount, ProgressBar, Spinner,
  useReducedMotion, useMotionDuration,
} from "@/ui/motion";
```

- **`<Skeleton width height rounded />`** — bloco com shimmer. Sempre no
  formato do conteúdo real. Sem shimmer com `prefers-reduced-motion`.
- **`<SkeletonText lines />`** / **`<SkeletonStat />`** — presets.
- **`<FadeIn variant="up|fade|pop" delay />`** — entrada de um bloco.
- **`<Stagger step maxItems>`** — entra os filhos em cascata curta.
- **`<Presence when>{(state, style) => …}</Presence>`** — entrada **e
  saída**. `state`: `"entering" | "entered" | "exiting"`. Use para modais,
  toasts, alertas, linhas removidas.
- **`<LazyMount fallback minHeight>`** — monta só perto da viewport;
  mostra o skeleton enquanto isso.
- **`<ProgressBar value />`** (0–100 ou indeterminada) / **`<Spinner />`**
  — carregamento e progresso.
- **`useReducedMotion()`** → `boolean`. **`useMotionDuration(ms)`** → 0
  quando o usuário pediu menos movimento.

## Checklist por tela

Ver `AGENTS.md §5`. Resumo: skeleton no formato certo · lazy-load do que é
pesado · entrada · **saída** · progresso · `prefers-reduced-motion`
respeitado · zero animação decorativa.

## Skeletons por aba

`src/ui/skeletons/TabSkeleton.jsx` — um skeleton por aba, no layout real.
`<TabSkeleton tab={tab} />` é o fallback enquanto a aba carrega em
`App.jsx`.
