import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Presence } from "./motion/index.js";

/**
 * Folha que sobe de baixo (issue #446, visual v18): calendário do mês, ações de um passageiro,
 * escolhas curtas. Entra subindo e sai descendo (Presence, AGENTS.md §5); `prefers-reduced-motion`
 * corta a animação. Fecha no fundo escuro, no Esc e devolve o foco para quem abriu.
 * No computador vira um painel centrado embaixo, com 420 px.
 * Cores pelas variáveis --at-* que o App define (a ui/ não importa a paleta do app).
 */
export function FolhaDeBaixo({ aberta, onFechar, titulo, subtitulo, children, testId }) {
  const idTitulo = useId();
  const painel = useRef(null);
  const antes = useRef(null);

  useEffect(() => {
    if (!aberta) return undefined;
    antes.current = document.activeElement;
    const t = setTimeout(() => {
      const alvo = painel.current?.querySelector("[data-foco-inicial]") ?? painel.current;
      alvo?.focus({ preventScroll: true });
    }, 30);
    const tecla = (e) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", tecla);
      antes.current?.focus?.({ preventScroll: true });
    };
  }, [aberta, onFechar]);

  return createPortal(
    <Presence when={aberta} duration={240}>
      {(estado) => {
        const dentro = estado === "entered";
        return (
          <div className="fixed inset-0 z-50" data-testid={testId}>
            <button
              type="button"
              aria-label="Fechar"
              tabIndex={-1}
              onClick={onFechar}
              className="absolute inset-0 w-full h-full cursor-default"
              style={{
                background: "rgba(0,0,0,.6)",
                opacity: dentro ? 1 : 0,
                transition: "opacity var(--motion-base) var(--ease-out-quart)",
              }}
            />
            <div
              ref={painel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titulo ? idTitulo : undefined}
              tabIndex={-1}
              className="absolute left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:w-[420px] md:bottom-4 md:-translate-x-1/2 rounded-t-3xl md:rounded-3xl px-2 pt-2 overflow-y-auto outline-none"
              style={{
                maxHeight: "90vh",
                paddingBottom: "max(14px, env(safe-area-inset-bottom))",
                background: "var(--at-panel)",
                boxShadow: "0 -1px 0 0 var(--at-border), 0 -24px 48px -24px #000",
                transform: dentro ? "translateY(0)" : "translateY(105%)",
                transition: dentro
                  ? "transform var(--motion-slow) var(--ease-out-quart)"
                  : "transform 200ms var(--ease-in)",
              }}
            >
              <div
                aria-hidden="true"
                className="w-9 h-1 rounded-full mx-auto mt-0.5 mb-2"
                style={{ background: "var(--at-border)" }}
              />
              {(titulo || subtitulo) && (
                <div className="px-2.5 pt-1 pb-2.5">
                  {titulo && (
                    <h2
                      id={idTitulo}
                      className="text-[17px] font-bold"
                      style={{ color: "var(--at-ink)", letterSpacing: "-.015em" }}
                    >
                      {titulo}
                    </h2>
                  )}
                  {subtitulo && (
                    <p className="text-[13px]" style={{ color: "var(--at-ink-soft)" }}>
                      {subtitulo}
                    </p>
                  )}
                </div>
              )}
              {children}
            </div>
          </div>
        );
      }}
    </Presence>,
    document.body,
  );
}
