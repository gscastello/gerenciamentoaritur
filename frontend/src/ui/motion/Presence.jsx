import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Mantém o filho montado durante a animação de SAÍDA. Sem isto, conteúdo
 * condicional (`{aberto && <Modal/>}`) some abruptamente — o que o
 * AGENTS.md §5 proíbe.
 *
 * Uso:
 *   <Presence when={aberto}>
 *     {(state) => <div data-state={state}>…</div>}
 *   </Presence>
 *
 * `state` é "entering" | "entered" | "exiting". Estilize as duas pontas via
 * [data-state] no seu CSS/inline, ou use os presets `enter`/`exit`.
 */
export function Presence({ when, children, duration = 240, enter, exit }) {
  const reduced = useReducedMotion();
  const effective = reduced ? 0 : duration;
  const [mounted, setMounted] = useState(when);
  const [state, setState] = useState(when ? "entered" : "exiting");
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    if (when) {
      setMounted(true);
      setState("entering");
      timer.current = setTimeout(() => setState("entered"), 20);
    } else if (mounted) {
      setState("exiting");
      timer.current = setTimeout(() => setMounted(false), effective);
    }
    return () => clearTimeout(timer.current);
  }, [when, mounted, effective]);

  if (!mounted) return null;

  const presetStyle =
    enter || exit
      ? {
          transition: `opacity ${effective}ms var(--ease-in), transform ${effective}ms var(--ease-in)`,
          ...(state === "entered" ? enter : exit),
        }
      : undefined;

  if (typeof children === "function") return children(state, presetStyle);

  return <div style={presetStyle} data-state={state}>{children}</div>;
}

/** Presets comuns para o render-prop. */
export const fadeScale = {
  enter: { opacity: 1, transform: "scale(1)" },
  exit: { opacity: 0, transform: "scale(0.97)" },
};
export const fadeSlideDown = {
  enter: { opacity: 1, transform: "translateY(0)" },
  exit: { opacity: 0, transform: "translateY(-6px)" },
};
