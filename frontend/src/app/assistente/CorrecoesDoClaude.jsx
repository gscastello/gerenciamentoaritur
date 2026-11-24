import { Check, ChevronDown, Wrench, X } from "lucide-react";
import { useState } from "react";
import { useCorrecoes } from "../../hooks/useCorrecoes.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton, fadeSlideDown } from "../../ui/motion/index.js";
import { C, ErrorBanner, tempoRelativo } from "../tabShared.jsx";

/* Fila que o Claude lê para consertar o bot e o app (issue #516, tabela bot_correcoes). */
export function CorrecoesDoClaude() {
  const [aberta, setAberta] = useState(false);
  const fila = useCorrecoes();
  const abertas = fila.lista.filter((c) => c.status === "aberta");
  return (
    <div className="rounded-2xl" style={{ background: C.panel2 }}>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="btn-press w-full flex items-center gap-3 px-4 min-h-[52px] text-left"
        style={{ color: C.ink }}
      >
        <Wrench size={18} className="shrink-0" style={{ color: C.inkSoft }} />
        <span className="flex-1 min-w-0 text-[15px] font-semibold">
          Correções para o Claude
          <span className="block text-[13px] font-normal" style={{ color: C.inkSoft }}>
            {fila.loading
              ? "conferindo a fila"
              : abertas.length === 0
                ? "nenhuma esperando"
                : `${abertas.length} esperando`}
          </span>
        </span>
        <ChevronDown
          size={18}
          style={{
            color: C.inkFaint,
            transform: aberta ? "rotate(180deg)" : undefined,
            transition: "transform var(--motion-fast) var(--ease-out-quart)",
          }}
        />
      </button>
      <Presence when={aberta} {...fadeSlideDown}>
        {(_e, estilo) => (
          <div className="px-4 pb-4 flex flex-col gap-2" style={estilo}>
            {fila.erro && <ErrorBanner>{mensagemAmigavel(fila.erro)}</ErrorBanner>}
            {fila.loading && <Skeleton height={54} rounded={12} />}
            {!fila.loading && fila.lista.length === 0 && (
              <p className="text-[13px]" style={{ color: C.inkSoft }}>
                Quando o bot errar, conte aqui o que aconteceu e como seria o certo. Fica guardado
                para o Claude corrigir.
              </p>
            )}
            {fila.lista.map((c) => (
              <FadeIn
                key={c.id}
                className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: C.panel, opacity: c.status === "corrigida" ? 0.7 : 1 }}
              >
                <div className="flex-1 min-w-0 text-[13px]" style={{ overflowWrap: "anywhere" }}>
                  <div style={{ color: C.ink }}>{c.o_que_errou}</div>
                  <div style={{ color: C.inkSoft }}>Certo: {c.o_certo}</div>
                  <div className="text-[12px] mt-1" style={{ color: C.inkFaint }}>
                    {c.status === "corrigida"
                      ? `Corrigida pelo Claude${c.nota_do_claude ? `: ${c.nota_do_claude}` : ""}`
                      : tempoRelativo(c.created_at)}
                  </div>
                </div>
                {c.status === "aberta" ? (
                  <button
                    type="button"
                    onClick={() => fila.descartar(c.id).catch(() => {})}
                    aria-label="Tirar esta correção da fila"
                    className="btn-press w-11 h-11 -mr-2 -my-1 rounded-xl flex items-center justify-center shrink-0"
                    style={{ color: C.inkFaint }}
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <Check size={16} className="shrink-0 mt-0.5" style={{ color: C.inkSoft }} />
                )}
              </FadeIn>
            ))}
          </div>
        )}
      </Presence>
    </div>
  );
}
