import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * true quando o usuário pediu menos movimento. Todos os componentes de
 * motion consultam este hook e cortam a animação para ~0 — nunca só
 * "diminuem". Obrigatório (AGENTS.md §5).
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

/** Duração efetiva: 0 quando o usuário pediu menos movimento. */
export function useMotionDuration(ms) {
  return useReducedMotion() ? 0 : ms;
}
