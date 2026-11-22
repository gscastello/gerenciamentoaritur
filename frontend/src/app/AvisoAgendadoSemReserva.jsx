// src/app/AvisoAgendadoSemReserva.jsx
//
// Faixa fixa no topo do app (issue #455): "Agendado ☑️" que a equipe marcou e o bot não conseguiu
// lançar. O passageiro acha que tem lugar e NÃO tem. Fica em todas as telas de quem agenda e só sai
// quando a pendência é resolvida (lançar a reserva já resolve sozinho — database/120).

import { AlertTriangle, ChevronRight } from "lucide-react";
import { agendadosSemReserva, tituloDaFaixa } from "../domain/agendadoSemReserva.js";
import { Presence, fadeSlideDown } from "../ui/motion/index.js";
import { C } from "./tabShared.jsx";

const MOSTRAR = 3;

function haQuanto(em, agora) {
  const t = Date.parse(em ?? "");
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((agora - t) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** A linha de um passageiro: quem, o motivo e há quanto tempo. */
function Linha({ p, agora }) {
  return (
    <>
      <b style={{ color: C.ink }}>{p.quem}</b>
      {p.parte ? " (parte do pedido)" : ""}
      {p.tipo === "pedido" ? " (pediu, sem Agendado)" : ""}: {p.motivo}
      {p.em && <span style={{ color: C.inkFaint }}> · {haQuanto(p.em, agora)}</span>}
    </>
  );
}

// `onAbrir(id)`: tocar no passageiro abre a Pendências já na pendência dele (issue #476)
export function AvisoAgendadoSemReserva({ pendencias, onResolver, onAbrir, agora = Date.now() }) {
  const lista = agendadosSemReserva(pendencias);
  const n = lista.length;
  return (
    <Presence when={n > 0} {...fadeSlideDown}>
      <div
        role="alert"
        data-testid="aviso-agendado-sem-reserva"
        className="mx-4 md:mx-10 mt-4 rounded-2xl border px-3.5 py-3"
        style={{ borderColor: C.red, background: C.redSoft }}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: C.red }} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold" style={{ color: C.ink }}>
              {tituloDaFaixa(lista)}
            </p>
            <ul className="mt-1.5 space-y-1">
              {lista.slice(0, MOSTRAR).map((p) => (
                <li key={p.id} className="text-[12.5px] leading-snug" style={{ color: C.inkSoft }}>
                  {onAbrir ? (
                    <button
                      type="button"
                      onClick={() => onAbrir(p.id)}
                      data-testid="abrir-pendencia"
                      className="btn-press toque-at w-full min-h-[44px] -my-1 py-1 text-left flex items-center gap-1 rounded-lg"
                    >
                      <span className="min-w-0 flex-1">
                        <Linha p={p} agora={agora} />
                      </span>
                      <ChevronRight
                        size={15}
                        className="shrink-0"
                        style={{ color: C.red }}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <Linha p={p} agora={agora} />
                  )}
                </li>
              ))}
            </ul>
            {n > MOSTRAR && (
              <p className="mt-1 text-[12.5px]" style={{ color: C.inkFaint }}>
                e mais {n - MOSTRAR}
              </p>
            )}
          </div>
        </div>
        {onResolver && (
          <button
            type="button"
            onClick={onResolver}
            className="btn-press toque-at mt-2.5 w-full min-h-[44px] rounded-xl text-[14px] font-semibold flex items-center justify-center gap-1"
            style={{ background: C.red, color: C.bg }}
          >
            Resolver agora <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </Presence>
  );
}
