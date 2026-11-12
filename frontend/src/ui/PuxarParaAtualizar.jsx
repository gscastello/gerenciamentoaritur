// src/ui/PuxarParaAtualizar.jsx
//
// "Puxar para atualizar" (issue #353): no topo da página, arrastar para baixo e
// soltar depois do limiar chama `onAtualizar` (o app recarrega, como fechar e
// abrir de novo). Indicador com entrada/saída suave; sem animação com
// prefers-reduced-motion. Toque dentro de janelas/menus fixos (modais, barra de
// baixo) ou de listas roladas não conta.

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LIMIAR_PUXAO, distanciaDoPuxao, puxaoAtualiza } from "../domain/puxarParaAtualizar.js";
import { Spinner, useReducedMotion } from "./motion/index.js";

/** O toque começou num lugar que não deve puxar a página? */
function toqueIgnorado(alvo) {
  for (let el = alvo; el && el !== document.body; el = el.parentElement) {
    if (el.dataset?.semPuxao !== undefined) return true;
    const estilo = window.getComputedStyle(el);
    if (estilo.position === "fixed") return true;
    if (/(auto|scroll)/.test(estilo.overflowY) && el.scrollTop > 0) return true;
  }
  return false;
}

export function PuxarParaAtualizar({ onAtualizar, cor = "currentColor", fundo = "#1c1c1c" }) {
  const reduzido = useReducedMotion();
  const [distancia, setDistancia] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const inicio = useRef(null);
  const atual = useRef(0);

  useEffect(() => {
    const comecar = (e) => {
      if (atualizando || e.touches.length !== 1 || window.scrollY > 0 || toqueIgnorado(e.target)) {
        inicio.current = null;
        return;
      }
      inicio.current = e.touches[0].clientY;
    };
    const mover = (e) => {
      if (inicio.current == null) return;
      if (window.scrollY > 0) {
        inicio.current = null;
        atual.current = 0;
        setDistancia(0);
        return;
      }
      const d = distanciaDoPuxao(e.touches[0].clientY - inicio.current);
      atual.current = d;
      setDistancia(d);
    };
    const soltar = () => {
      if (inicio.current == null) return;
      inicio.current = null;
      if (puxaoAtualiza(atual.current)) {
        setAtualizando(true);
        setDistancia(LIMIAR_PUXAO);
        onAtualizar();
      } else {
        setDistancia(0);
      }
      atual.current = 0;
    };
    window.addEventListener("touchstart", comecar, { passive: true });
    window.addEventListener("touchmove", mover, { passive: true });
    window.addEventListener("touchend", soltar);
    window.addEventListener("touchcancel", soltar);
    return () => {
      window.removeEventListener("touchstart", comecar);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", soltar);
      window.removeEventListener("touchcancel", soltar);
    };
  }, [atualizando, onAtualizar]);

  const visivel = distancia > 0 || atualizando;
  const pronto = puxaoAtualiza(distancia);
  return (
    <div
      aria-hidden={!visivel}
      role="status"
      aria-label={atualizando ? "Atualizando" : undefined}
      className="fixed left-1/2 z-50 flex items-center justify-center rounded-full"
      style={{
        top: "env(safe-area-inset-top)",
        width: 38,
        height: 38,
        marginLeft: -19,
        background: fundo,
        color: cor,
        boxShadow: "0 4px 14px rgba(0,0,0,.35)",
        transform: `translateY(${visivel ? distancia - 30 : -60}px)`,
        opacity: visivel ? Math.min(1, distancia / LIMIAR_PUXAO + (atualizando ? 1 : 0)) : 0,
        // o dedo controla enquanto arrasta; ao soltar, volta/encaixa suave
        transition:
          reduzido || inicio.current != null
            ? "none"
            : "transform var(--dur-base, 240ms) var(--ease-out-quart, ease-out), opacity var(--dur-fast, 120ms) ease-out",
        pointerEvents: "none",
      }}
    >
      {atualizando ? (
        <Spinner size={18} color={cor} />
      ) : (
        <RefreshCw
          size={18}
          style={{
            transform: `rotate(${pronto ? 180 : (distancia / LIMIAR_PUXAO) * 180}deg)`,
            transition: reduzido ? "none" : "transform var(--dur-fast, 120ms) ease-out",
          }}
        />
      )}
    </div>
  );
}
