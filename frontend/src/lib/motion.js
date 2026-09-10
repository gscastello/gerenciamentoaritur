// src/lib/motion.js
//
// Preferência de movimento do app (por dispositivo, localStorage):
//   "auto"  — segue o sistema operacional (padrão; respeita quem tem
//             "reduzir animações" ligado no Windows/macOS)
//   "on"    — força as animações mesmo que o sistema peça para reduzir
//   "off"   — desliga tudo
//
// O valor EFETIVO ("on" | "off") é resolvido aqui e escrito em
// `document.documentElement.dataset.motion` — o CSS (GlobalStyles) só
// olha `html[data-motion="off"]`. Assim é uma fonte de verdade só.

const KEY = "aritur-motion";
const MQ = "(prefers-reduced-motion: reduce)";

export function getMotionPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** "on" | "off" — o que de fato vale agora. */
export function resolveMotion(pref = getMotionPref()) {
  if (pref === "on") return "on";
  if (pref === "off") return "off";
  const reduce =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MQ).matches;
  return reduce ? "off" : "on";
}

/** Escreve o valor efetivo no <html>. Chamar cedo (main.jsx) e a cada mudança. */
export function applyMotion(pref) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = resolveMotion(pref);
}

export function setMotionPref(pref) {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* modo privado / storage bloqueado — só não persiste */
  }
  applyMotion(pref);
}

/** Reavalia quando o sistema muda de ideia (só importa no modo "auto"). */
export function watchSystemMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(MQ);
  const handler = () => {
    if (getMotionPref() === "auto") applyMotion("auto");
  };
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
