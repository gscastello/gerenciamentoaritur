import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Barra de progresso. `value` 0..100 => determinada (steps de formulário,
 * upload). Sem `value` => indeterminada (carregando sem total conhecido).
 */
export function ProgressBar({ value, height = 4, trackColor = "var(--panel2,#1c222b)", color = "var(--amber,#e8a33d)", label }) {
  const reduced = useReducedMotion();
  const indeterminate = value == null;

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ width: "100%", height, borderRadius: 999, background: trackColor, overflow: "hidden" }}
    >
      <div
        style={{
          height: "100%",
          borderRadius: 999,
          background: color,
          width: indeterminate ? "40%" : `${Math.max(0, Math.min(100, value))}%`,
          transition: reduced ? undefined : "width var(--motion-slow) var(--ease-out-quart)",
          animation:
            indeterminate && !reduced ? "motion-progress-slide 1.1s ease-in-out infinite" : undefined,
        }}
      />
      <style>{`@keyframes motion-progress-slide {
        0% { margin-left: -40%; } 100% { margin-left: 100%; }
      }`}</style>
    </div>
  );
}

/** Spinner circular pequeno para botões em ação. */
export function Spinner({ size = 14, stroke = 2, color = "currentColor" }) {
  const reduced = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${stroke}px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: reduced ? undefined : "motion-spin 0.7s linear infinite",
      }}
    />
  );
}
