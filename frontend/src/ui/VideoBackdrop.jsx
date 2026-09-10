// src/ui/VideoBackdrop.jsx
//
// Camadas de vídeo AriTur (loop curto, sem áudio). Três tratamentos:
//
//   variant="login" — o ônibus da empresa cobrindo a viewport atrás do
//                     card de login
//   variant="hero"  — o ônibus INTEIRO num card (Dashboard), ancorado à
//                     direita, com véu escuro do lado do texto
//   variant="app"   — pôr-do-sol vermelho como fundo fixo de TODAS as
//                     telas, bem borrado e escurecido — atmosfera
//
// Regras:
//   - respeita a preferência de movimento (aba Sistema / sistema
//     operacional): movimento OFF → só o pôster estático;
//   - respeita "economia de dados" do navegador (Save-Data) → só pôster;
//   - o fundo "app" só roda o vídeo em telas grandes (>= 820px) — no
//     celular do motorista fica o pôster, sem gastar bateria;
//   - pausa quando a aba perde o foco;
//   - <video> sempre muted + playsInline + loop; aria-hidden (decoração);
//   - estilos inline → funciona também na tela de login (que não carrega
//     o CSS global do app).

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion/index.js";

const BG = "#08090B";
const GLOW = "rgba(228,18,31,0.10)";

const ASSET = {
  app: { mp4: "/media/aritur-bg.mp4", poster: "/media/aritur-bg-poster.jpg" },
  hero: { mp4: "/media/aritur-hero.mp4", poster: "/media/aritur-hero-poster.jpg" },
  login: { mp4: "/media/aritur-hero.mp4", poster: "/media/aritur-hero-poster.jpg" },
};

const VEIL = {
  app: `linear-gradient(180deg, rgba(8,9,11,.9) 0%, rgba(8,9,11,.85) 42%, rgba(8,9,11,.95) 100%),radial-gradient(120% 90% at 50% 6%, ${GLOW} 0%, transparent 60%)`,
  hero:
    "linear-gradient(90deg, rgba(8,9,11,.97) 0%, rgba(8,9,11,.82) 30%, rgba(8,9,11,.15) 62%, rgba(120,10,15,.12) 100%)," +
    "linear-gradient(180deg, transparent 55%, rgba(8,9,11,.55) 100%)",
  login:
    "radial-gradient(120% 90% at 50% 45%, rgba(8,9,11,.5) 0%, rgba(8,9,11,.92) 78%)," +
    "linear-gradient(180deg, rgba(8,9,11,.72) 0%, rgba(8,9,11,.86) 100%)",
};

function prefersSaveData() {
  try {
    return Boolean(navigator.connection?.saveData);
  } catch {
    return false;
  }
}
function isSmallScreen() {
  try {
    return window.matchMedia("(max-width: 819px)").matches;
  } catch {
    return false;
  }
}

export function VideoBackdrop({ variant = "app" }) {
  const reduced = useReducedMotion();
  const [saveData] = useState(prefersSaveData);
  const [small, setSmall] = useState(isSmallScreen);
  const [shown, setShown] = useState(false);
  const cls = useRef(`vbd-${Math.random().toString(36).slice(2, 8)}`).current;
  const a = ASSET[variant];

  // O fundo do app só anima em tela grande (o dono na mesa). Login/hero
  // animam sempre (é o foco da marca).
  const estatico = reduced || saveData || (variant === "app" && small);
  const ref = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 30);
    const mq = window.matchMedia?.("(max-width: 819px)");
    const onResize = () => setSmall(Boolean(mq?.matches));
    mq?.addEventListener?.("change", onResize);
    return () => {
      clearTimeout(t);
      mq?.removeEventListener?.("change", onResize);
    };
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || estatico) return;
    const p = v.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
    const onVis = () => {
      if (document.hidden) v.pause();
      else v.play?.().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [estatico]);

  const wrap = {
    position: variant === "hero" ? "absolute" : "fixed",
    inset: 0,
    zIndex: 0,
    overflow: "hidden",
    pointerEvents: "none",
    background: BG,
  };

  const base = { opacity: shown ? 1 : 0, transition: "opacity 1s ease", background: BG };
  let mediaStyle;
  if (variant === "hero") {
    mediaStyle = {
      ...base,
      position: "absolute",
      right: 0,
      bottom: 0,
      height: "100%",
      width: "auto",
      objectFit: "cover",
      objectPosition: "center",
      filter: "saturate(.95) brightness(.82)",
    };
  } else {
    mediaStyle = {
      ...base,
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center",
      ...(variant === "app"
        ? { filter: "blur(4px) saturate(.8) brightness(.68)", transform: "scale(1.1)" }
        : { filter: "brightness(.72) saturate(.9)", transform: "scale(1.04)" }),
    };
  }

  const Media = estatico ? (
    <div
      className={`${cls}-m`}
      style={{
        ...mediaStyle,
        backgroundImage: `url(${a.poster})`,
        backgroundSize: variant === "hero" ? "auto 100%" : "cover",
        backgroundPosition: variant === "hero" ? "right center" : "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  ) : (
    <video
      ref={ref}
      className={`${cls}-m`}
      style={mediaStyle}
      src={a.mp4}
      poster={a.poster}
      autoPlay
      muted
      loop
      playsInline
      preload={variant === "app" ? "none" : "metadata"}
      tabIndex={-1}
    />
  );

  return (
    <div style={wrap} aria-hidden="true">
      {variant === "hero" && (
        <style>{`
          @media (max-width: 767px) {
            .${cls}-m {
              right: 0 !important; bottom: auto !important; top: 0 !important;
              height: auto !important; width: 100% !important;
              filter: brightness(.55) saturate(.9) !important;
              background-size: cover !important; background-position: 50% 40% !important;
            }
            .${cls}-v {
              background:
                linear-gradient(180deg, rgba(8,9,11,.8) 0%, rgba(8,9,11,.55) 42%, rgba(8,9,11,.92) 100%),
                linear-gradient(90deg, rgba(8,9,11,.55) 0%, rgba(8,9,11,.25) 60%, transparent 100%) !important;
            }
          }
          @media (min-width: 1280px) {
            .${cls}-m { height: 110% !important; bottom: -5% !important; }
          }
        `}</style>
      )}
      {Media}
      <div className={`${cls}-v`} style={{ position: "absolute", inset: 0, background: VEIL[variant] }} />
    </div>
  );
}
