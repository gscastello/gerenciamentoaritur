// src/ui/VideoBackdrop.jsx
//
// Camada de vídeo do "hero" AriTur — o ônibus da empresa sob o céu
// vermelho (loop curto e sem áudio, ~0,6 MB). Três tratamentos:
//
//   variant="login" — vídeo cobrindo a viewport atrás do card de login
//   variant="hero"  — dentro de um card (Dashboard), com véu lateral
//   variant="app"   — fundo fixo de todas as telas, bem desbotado/borrado
//
// Regras:
//   - respeita a preferência de movimento (aba Sistema / sistema
//     operacional): com movimento OFF, mostra só o pôster estático;
//   - respeita "economia de dados" do navegador (Save-Data) → só pôster;
//   - o <video> é sempre muted + playsInline + loop (autoplay exige mudo);
//   - aria-hidden — é decoração. Estilos inline: funciona também na tela
//     de login, que não carrega o CSS global do app.

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion/index.js";

const SRC = "/media/aritur-hero.mp4";
const POSTER = "/media/aritur-hero-poster.jpg";
const BG = "#08090B";
const GLOW = "rgba(228,18,31,0.10)";

const VEIL = {
  app: `linear-gradient(180deg, rgba(8,9,11,.94) 0%, rgba(8,9,11,.9) 40%, rgba(8,9,11,.96) 100%),radial-gradient(120% 80% at 50% -10%, ${GLOW} 0%, transparent 55%)`,
  hero:
    "linear-gradient(95deg, rgba(8,9,11,.9) 0%, rgba(8,9,11,.55) 42%, rgba(120,10,15,.28) 100%)," +
    "linear-gradient(180deg, transparent 35%, rgba(8,9,11,.72) 100%)," +
    "radial-gradient(90% 120% at 88% 18%, rgba(228,18,31,.28) 0%, transparent 55%)",
  login:
    "radial-gradient(120% 90% at 50% 45%, rgba(8,9,11,.5) 0%, rgba(8,9,11,.92) 78%)," +
    "linear-gradient(180deg, rgba(8,9,11,.72) 0%, rgba(8,9,11,.86) 100%)",
};
const MEDIA_FX = {
  app: {
    filter: "blur(3px) saturate(.7) brightness(.62)",
    transform: "scale(1.08)",
    objectPosition: "center",
  },
  hero: { filter: "saturate(.95) brightness(.78)", transform: "none", objectPosition: "58% 42%" },
  login: {
    filter: "brightness(.72) saturate(.9)",
    transform: "scale(1.04)",
    objectPosition: "center",
  },
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
  // O fundo fixo de todas as telas ("app") usa só o pôster — atrás de
  // tela operacional o vídeo em loop eterno não paga o custo de bateria/
  // CPU no celular. O vídeo em movimento fica onde é o foco: login e o
  // hero do Dashboard.
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
    // pausa quando a aba sai de foco (economiza bateria)
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
  };
  const media = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    background: BG,
    opacity: shown ? 1 : 0,
    transition: "opacity .9s ease",
    ...MEDIA_FX[variant],
  };

  return (
    <div style={wrap} aria-hidden="true">
      {estatico ? (
        <div
          style={{
            ...media,
            backgroundImage: `url(${POSTER})`,
            backgroundSize: "cover",
            backgroundPosition: media.objectPosition,
          }}
        />
      ) : (
        <video
          ref={ref}
          style={media}
          src={SRC}
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
        />
      )}
      <div style={{ position: "absolute", inset: 0, background: VEIL[variant] }} />
    </div>
  );
}
