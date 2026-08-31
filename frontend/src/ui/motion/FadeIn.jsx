import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Entrada suave de um bloco. `variant`:
 *  - "up"   -> fade + sobe 8px (padrão, conteúdo que "assenta")
 *  - "fade" -> só opacidade
 *  - "pop"  -> fade + scale (modais, confirmações)
 */
export function FadeIn({
  children,
  variant = "up",
  delay = 0,
  duration = "var(--motion-base)",
  as: Tag = "div",
  style,
  ...rest
}) {
  const reduced = useReducedMotion();
  const anim = { up: "motion-fade-up", fade: "motion-fade-in", pop: "motion-pop-in" }[variant];

  return (
    <Tag
      style={{
        animation: reduced ? undefined : `${anim} ${duration} var(--ease-out-quart) both`,
        animationDelay: reduced ? undefined : `${delay}ms`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
