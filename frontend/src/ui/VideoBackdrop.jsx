// src/ui/VideoBackdrop.jsx
//
// Camada de vídeo do "hero" AriTur — o ônibus da empresa sob o céu
// vermelho (loop curto e sem áudio, ~0,6 MB). Três tratamentos:
//
//   variant="login" — vídeo cobrindo a viewport atrás do card de login
//   variant="hero"  — dentro de um card (Dashboard): o ônibus INTEIRO,
//                     ancorado à direita, com véu escuro do lado do texto
//   variant="app"   — fundo fixo de todas as telas, bem desbotado/borrado
//
// Regras:
//   - respeita a preferência de movimento (aba Sistema / sistema
//     operacional): com movimento OFF, mostra só o pôster estático;
//   - respeita "economia de dados" do navegador (Save-Data) → só pôster;
//   - o <video> é sempre muted + playsInline + loop (autoplay exige mudo);
//   - aria-hidden — é decoração. Estilos inline (funciona na tela de
//     login, que não carrega o CSS global do app).

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion/index.js";

const SRC = "/media/aritur-hero.mp4";
const POSTER = "/media/aritur-hero-poster.jpg";
const BG = "#08090B";
const GLOW = "rgba(228,18,31,0.10)";

const VEIL = {
  app: `linear-gradient(180deg, rgba(8,9,11,.94) 0%, rgba(8,9,11,.9) 40%, rgba(8,9,11,.96) 100%),radial-gradient(120% 80% at 50% -10%, ${GLOW} 0%, transparent 55%)`,
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

export function VideoBackdrop({ variant = "app" }) {
  const reduced = useReducedMotion();
  const [saveData] = useState(prefersSaveData);
  const [shown, setShown] = useState(false);
  const cls = useRef(`vbd-${Math.random().toString(36).slice(2, 8)}`).current;
  // O fundo fixo de todas as telas ("app") usa só o pôster — atrás de
  // tela operacional o vídeo em loop eterno não paga o custo de bateria/
  // CPU no celular. O vídeo em movimento fica no login e no hero.
  const estatico = variant === "app" || reduced || saveData;
  const ref = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(t);
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

  // Estilo da mídia por variante.
  const base = { opacity: shown ? 1 : 0, transition: "opacity .9s ease", background: BG };
  let mediaStyle;
  if (variant === "hero") {
    // ônibus inteiro, ancorado à direita — o vídeo mantém a proporção
    // natural, não é esticado nem fatiado. O CSS abaixo cuida do mobile.
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
        ? { filter: "blur(3px) saturate(.7) brightness(.62)", transform: "scale(1.08)" }
        : { filter: "brightness(.72) saturate(.9)", transform: "scale(1.04)" }),
    };
  }

  const Media = estatico ? (
    <div
      className={`${cls}-m`}
      style={{
        ...mediaStyle,
        backgroundImage: `url(${POSTER})`,
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
      src={SRC}
      poster={POSTER}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
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
