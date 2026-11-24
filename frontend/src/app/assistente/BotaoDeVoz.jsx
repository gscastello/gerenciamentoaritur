import { Mic, Square } from "lucide-react";
import { gravacaoDisponivel } from "../../hooks/useGravador.js";
import { useVoz } from "../../hooks/useVoz.js";
import { Spinner } from "../../ui/motion/index.js";
import { C } from "../tabShared.jsx";

/* Microfone pequeno dos campos (anotação da Agenda): grava, transcreve no servidor e escreve no campo.
   Nada é salvo sozinho. Aparelho que não grava não mostra o botão. */
export function BotaoDeVoz({ rotulo, onTexto, onErro }) {
  const voz = useVoz({ onTexto, onErro });
  if (!gravacaoDisponivel()) return null;
  const ocupado = voz.transcrevendo || voz.preparando;
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={() => (voz.gravando ? voz.parar() : voz.iniciar())}
      aria-label={voz.gravando ? "Terminar a fala" : rotulo}
      aria-pressed={voz.gravando}
      className="btn-press shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
      style={{
        background: voz.gravando ? C.brand : C.panel2,
        color: voz.gravando ? C.onBrand : C.inkSoft,
      }}
    >
      {ocupado ? <Spinner /> : voz.gravando ? <Square size={14} /> : <Mic size={17} />}
    </button>
  );
}
