// src/ui/useArrastarParaOrdenar.js
//
// Arrastar para reordenar com o DEDO e com o mouse (issue #413). O arrastar do navegador
// (`draggable`/onDragStart) só funciona com mouse: no celular o toque não dispara o arrasto e
// a linha não saía do lugar. Aqui é por pointer events numa alça (⋮⋮): segura a alça, arrasta
// e a linha troca de lugar ao passar da metade da vizinha. A rolagem da página acompanha perto
// das bordas. `touch-action: none` na alça impede o navegador de rolar no lugar de arrastar.
// Cada linha precisa de `data-ordem-id={id}`.

import { useCallback, useRef, useState } from "react";

/** Para onde vai `id` com o dedo em `y`: o vizinho cuja metade foi passada, ou null. */
export function destinoDoArrasto(ordem, id, y, retangulos) {
  const de = ordem.indexOf(id);
  if (de === -1) return null;
  // descendo: o próximo, quando o dedo passa da metade dele
  for (let i = ordem.length - 1; i > de; i -= 1) {
    const r = retangulos[ordem[i]];
    if (r && y > r.top + r.height / 2) return ordem[i];
  }
  // subindo: o anterior, quando o dedo passa da metade dele
  for (let i = 0; i < de; i += 1) {
    const r = retangulos[ordem[i]];
    if (r && y < r.top + r.height / 2) return ordem[i];
  }
  return null;
}

/**
 * @param {string[]} ordem ids na ordem atual
 * @param {(ids: string[]) => void} setOrdem
 * @param {(ids: string[], id: string, destinoId: string) => string[]} mover move `id` para o lugar de `destinoId`
 */
export function useArrastarParaOrdenar(ordem, setOrdem, mover) {
  const [arrastando, setArrastando] = useState(null);
  const estado = useRef({ id: null, ordem });
  estado.current.ordem = ordem;

  const retangulos = () => {
    const out = {};
    for (const el of document.querySelectorAll("[data-ordem-id]")) {
      out[el.getAttribute("data-ordem-id")] = el.getBoundingClientRect();
    }
    return out;
  };

  const terminar = useCallback(() => {
    estado.current.id = null;
    setArrastando(null);
  }, []);

  /** Props da alça de arrastar da linha `id`. */
  const alca = (id) => ({
    "data-sem-puxao": "",
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      estado.current.id = id;
      setArrastando(id);
    },
    onPointerMove: (e) => {
      const atual = estado.current.id;
      if (!atual) return;
      e.preventDefault();
      const destino = destinoDoArrasto(estado.current.ordem, atual, e.clientY, retangulos());
      if (destino) {
        const nova = mover(estado.current.ordem, atual, destino);
        estado.current.ordem = nova;
        setOrdem(nova);
      }
      const margem = 90;
      if (e.clientY < margem) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - margem) window.scrollBy(0, 14);
    },
    onPointerUp: terminar,
    onPointerCancel: terminar,
    style: { touchAction: "none", cursor: arrastando === id ? "grabbing" : "grab" },
  });

  return { arrastando, alca };
}
