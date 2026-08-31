import { Children } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Entra os filhos em cascata curta. `step` é o atraso entre itens; teto de
 * ~6 itens animados para não arrastar listas longas (lente Kowalski:
 * restrição). O resto entra junto no último tempo.
 */
export function Stagger({ children, step = 35, maxItems = 6, style, className }) {
  const reduced = useReducedMotion();
  const items = Children.toArray(children);

  return (
    <div style={style} className={className}>
      {items.map((child, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: ordem estável de render
          key={i}
          style={{
            animation: reduced
              ? undefined
              : "motion-fade-up var(--motion-base) var(--ease-out-quart) both",
            animationDelay: reduced ? undefined : `${Math.min(i, maxItems) * step}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
