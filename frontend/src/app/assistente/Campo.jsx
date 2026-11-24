import { ArrowUp, Check, Mic, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { relogio } from "../../domain/assistente.js";
import { gravacaoDisponivel } from "../../hooks/useGravador.js";
import { useVoz } from "../../hooks/useVoz.js";
import { Spinner, useReducedMotion } from "../../ui/motion/index.js";
import { C } from "../tabShared.jsx";

const BARRAS = Array.from({ length: 24 }, (_, i) => i);

/** As barras sobem com a voz: mostram que o microfone está ouvindo. */
function Onda({ nivel }) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex-1 flex items-center justify-center gap-[3px] h-10" aria-hidden="true">
      {BARRAS.map((i) => {
        const perto = 1 - Math.abs(i - 11.5) / 12;
        const altura = 4 + nivel * 34 * (0.35 + perto * 0.65) * (i % 3 === 1 ? 0.7 : 1);
        return (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              height: Math.max(4, altura),
              background: nivel > 0.12 ? C.lanterna : C.contorno,
              transition: reduzir ? "none" : "height 90ms linear",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Campo do pedido: escrever ou falar. A fala para sozinha no silêncio e vai direto para o assistente.
 * A letra tem 16 px: menor que isso o iPhone dá zoom na tela ao tocar.
 */
export function Campo({ inicial, pensando, onEnviar, onFala, onErro, onComecarAFalar }) {
  const [texto, setTexto] = useState("");
  const area = useRef(null);
  const voz = useVoz({ onTexto: onFala, onErro });

  // cresce até 5 linhas
  // biome-ignore lint/correctness/useExhaustiveDependencies: a altura depende do texto
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [texto]);

  // a sugestão escreve o começo do pedido e põe o cursor no fim
  useEffect(() => {
    if (!inicial?.n) return;
    setTexto(inicial.texto);
    requestAnimationFrame(() => {
      const el = area.current;
      el?.focus();
      el?.setSelectionRange(inicial.texto.length, inicial.texto.length);
    });
  }, [inicial]);

  const mandar = () => {
    if (!texto.trim() || pensando) return;
    onEnviar(texto);
    setTexto("");
  };

  if (voz.gravando || voz.transcrevendo || voz.preparando) {
    return (
      <div
        className="flex items-center gap-2 rounded-[28px] p-2"
        style={{ background: C.panel2, boxShadow: `inset 0 0 0 1px ${C.rubro}` }}
        role="status"
        aria-label={voz.transcrevendo ? "Entendendo a fala" : "Ouvindo"}
      >
        <button
          type="button"
          onClick={voz.cancelar}
          disabled={voz.transcrevendo}
          aria-label="Cancelar a fala"
          className="btn-press w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: C.panel, color: C.inkSoft }}
        >
          <X size={20} />
        </button>
        {voz.transcrevendo || voz.preparando ? (
          <div
            className="flex-1 flex items-center justify-center gap-2 text-[15px]"
            style={{ color: C.inkSoft }}
          >
            <Spinner /> {voz.transcrevendo ? "Entendendo" : "Ligando o microfone"}
          </div>
        ) : (
          <>
            <Onda nivel={voz.nivel} />
            <span
              className="text-[14px] w-10 text-right"
              style={{ color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}
            >
              {relogio(voz.ms)}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => voz.parar()}
          disabled={!voz.gravando}
          aria-label="Terminar a fala"
          className="btn-press w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: voz.gravando ? C.brand : C.panel,
            color: voz.gravando ? C.onBrand : C.inkFaint,
          }}
        >
          <Check size={20} />
        </button>
      </div>
    );
  }

  const temTexto = !!texto.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mandar();
      }}
      className="flex items-end gap-1.5 rounded-[28px] p-2"
      style={{ background: C.panel2, boxShadow: `inset 0 0 0 1px ${C.border}` }}
    >
      <textarea
        ref={area}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            mandar();
          }
        }}
        rows={1}
        placeholder="Peça ou explique um erro"
        aria-label="Pedido para o assistente"
        enterKeyHint="send"
        autoComplete="off"
        className="assistente-campo flex-1 min-w-0 bg-transparent outline-none resize-none px-3 py-3"
        style={{ color: C.ink, fontSize: 16, lineHeight: 1.4, maxHeight: 132 }}
      />
      {temTexto || !gravacaoDisponivel() ? (
        <button
          type="submit"
          disabled={!temTexto || pensando}
          aria-label="Enviar"
          className="btn-press w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: temTexto && !pensando ? C.brand : C.panel,
            color: temTexto && !pensando ? C.onBrand : C.inkFaint,
          }}
        >
          {pensando ? <Spinner /> : <ArrowUp size={21} strokeWidth={2.4} />}
        </button>
      ) : (
        <button
          type="button"
          disabled={pensando}
          onClick={() => {
            onComecarAFalar?.();
            voz.iniciar();
          }}
          aria-label="Falar o pedido"
          className="btn-press w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: pensando ? C.panel : C.brand,
            color: pensando ? C.inkFaint : C.onBrand,
          }}
        >
          {pensando ? <Spinner /> : <Mic size={21} />}
        </button>
      )}
    </form>
  );
}
