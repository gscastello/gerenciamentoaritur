import { Sparkles } from "lucide-react";
import React, { Suspense } from "react";
import { Presence, Skeleton, Spinner } from "../../ui/motion/index.js";
import { C } from "../tabShared.jsx";
import { useAbrirAssistente, useConversaDoAssistente } from "./contexto.jsx";

const Painel = React.lazy(() => import("./Painel.jsx"));

/* ===================== ASSISTENTE EM QUALQUER TELA (issue #516) =====================
   Um botão sempre à mão, do lado oposto ao "+", e a folha que sobe por cima da tela em que a
   pessoa está. A conversa continua viva com a folha fechada. */
export function Assistente({ nome, pendencias, noInicio, onIrPendencias }) {
  const { abrir, fechar } = useAbrirAssistente();
  const { aberto, pensando } = useConversaDoAssistente();
  return (
    <>
      <button
        type="button"
        onClick={() => abrir()}
        aria-label="Abrir o assistente"
        data-testid="botao-assistente"
        className="btn-press fixed z-20 left-4 bottom-[var(--assistente-baixo)] md:left-auto md:right-6 md:bottom-[92px] flex items-center gap-2 h-[52px] pl-3.5 pr-4 rounded-2xl text-[15px] font-semibold"
        style={{
          "--assistente-baixo": `calc(${noInicio ? 93 : 76}px + env(safe-area-inset-bottom))`,
          background: C.panel2,
          color: C.ink,
          boxShadow: `inset 0 0 0 1px ${C.rubro}, 0 12px 26px -12px rgba(0,0,0,.9)`,
        }}
      >
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: C.brand, color: C.onBrand }}
        >
          {pensando ? <Spinner size={15} color={C.onBrand} /> : <Sparkles size={17} />}
        </span>
        Assistente
      </button>
      <Presence when={aberto} duration={260}>
        {(estado) => (
          <Suspense
            fallback={
              <div
                className="fixed inset-0 z-50 p-4 flex flex-col gap-3 justify-end"
                style={{ background: C.bg }}
              >
                <Skeleton height={72} rounded={16} />
                <Skeleton height={60} rounded={28} />
              </div>
            }
          >
            <Painel
              estado={estado}
              nome={nome}
              pendencias={pendencias}
              onFechar={fechar}
              onIrPendencias={onIrPendencias}
            />
          </Suspense>
        )}
      </Presence>
    </>
  );
}
