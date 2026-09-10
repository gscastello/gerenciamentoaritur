import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Estado EFETIVO de "menos movimento":
 *   - fonte de verdade = `html[data-motion]` ("on" | "off"), resolvido em
 *     src/lib/motion.js a partir da preferência do usuário (aba Sistema →
 *     Movimento) + o ajuste do sistema operacional;
 *   - se o atributo ainda não existe (JS não rodou), cai no matchMedia.
 *
 * Assim "Ligado" reativa TUDO (heros e componentes de motion) mesmo com
 * "reduzir animações" no sistema, e "Automático" continua respeitando o
 * sistema — regra do AGENTS.md §5 preservada como padrão.
 */
function readReduced() {
  if (typeof document !== "undefined") {
    const dm = document.documentElement.dataset.motion;
    if (dm === "off") return true;
    if (dm === "on") return false;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia(QUERY).matches;
  }
  return false;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(readReduced);

  useEffect(() => {
    const update = () => setReduced(readReduced());
    const mq = window.matchMedia?.(QUERY);
    mq?.addEventListener?.("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    update();
    return () => {
      mq?.removeEventListener?.("change", update);
      obs.disconnect();
    };
  }, []);

  return reduced;
}

/** Duração efetiva: 0 quando o usuário pediu menos movimento. */
export function useMotionDuration(ms) {
  return useReducedMotion() ? 0 : ms;
}
