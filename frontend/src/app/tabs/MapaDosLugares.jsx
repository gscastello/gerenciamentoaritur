import { fileirasDoVeiculo, ocupacaoDosLugares } from "../../domain/mapaDosLugares.js";
import { C } from "../tabShared.jsx";

/**
 * Mapa dos lugares da Agenda (issue #430), no lugar da barra de lotação: o desenho do veículo da
 * viagem do dia (ônibus de 31 ou van de 15). Confirmados acesos, pendentes riscados, livres vazios.
 * A troca de estado de um lugar é uma transição curta; `prefers-reduced-motion` a desliga (tokens.css).
 */
export default function MapaDosLugares({ capacidade, confirmados, pendentes, direcao, children }) {
  const fileiras = fileirasDoVeiculo(capacidade);
  const o = ocupacaoDosLugares({ capacidade, confirmados, pendentes });
  const fundo = (e) =>
    e === "confirmado"
      ? C.ink
      : e === "pendente"
        ? `repeating-linear-gradient(135deg, ${C.ink} 0 1.5px, transparent 1.5px 4px)`
        : "transparent";
  const borda = (e) =>
    e === "confirmado" ? "none" : `inset 0 0 0 1.5px ${e === "pendente" ? C.ink : C.border}`;
  const casa = (c, i) => {
    if (c.tipo === "corredor") return <span key={`c${i}`} className="block w-2 shrink-0" />;
    // a porta: um traço na lateral direita, na altura da frente
    if (c.tipo === "porta")
      return (
        <span key={`p${i}`} className="flex w-3 shrink-0 justify-end">
          <span className="block w-[3px] h-3 rounded-sm" style={{ background: C.border }} />
        </span>
      );
    const e = o.estado(c.n);
    return (
      <i
        key={c.n}
        className="block shrink-0 rounded-[4px_4px_3px_3px]"
        data-lugar={e}
        style={{
          width: 12,
          height: 12,
          background: fundo(e),
          boxShadow: borda(e),
          transition:
            "background var(--motion-base) var(--ease-out-quart), box-shadow var(--motion-base) var(--ease-out-quart)",
        }}
      />
    );
  };
  return (
    <div
      className="flex items-center gap-4"
      data-testid={`mapa-lugares-${direcao}`}
      role="img"
      aria-label={`${o.acesos} de ${o.total} lugares ocupados, ${o.riscados} pendentes, ${o.livres} livres`}
    >
      <div
        className="relative shrink-0 rounded-[20px_20px_10px_10px] px-2.5 pt-4 pb-2.5 grid gap-[4px]"
        style={{ background: C.panel, boxShadow: `inset 0 0 0 1px ${C.border}` }}
      >
        {/* a frente do veículo */}
        <span
          aria-hidden="true"
          className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-7 rounded"
          style={{ background: C.border }}
        />
        {fileiras.map((f, i) => (
          // a fileira não muda de lugar: o índice é a posição dela no veículo
          // biome-ignore lint/suspicious/noArrayIndexKey: fileiras fixas do desenho
          <div key={i} className="flex gap-[4px]">
            {f.map(casa)}
          </div>
        ))}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className="tabular-nums"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-.035em",
              lineHeight: 1,
              color: C.ink,
            }}
          >
            {o.acesos}
          </span>
          <span className="text-[13px]" style={{ color: C.inkSoft }}>
            de {o.total} lugares
          </span>
        </div>
        <p className="text-[13px] font-semibold tabular-nums" style={{ color: C.ink }}>
          {o.livres === 0 ? "lotado" : `${o.livres} ${o.livres === 1 ? "livre" : "livres"}`}
        </p>
        {children}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
          {[
            ["confirmado", "confirmado"],
            ["pendente", "pendente"],
            ["livre", "livre"],
          ].map(([e, t]) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 text-[12px]"
              style={{ color: C.inkFaint }}
            >
              <i
                className="block rounded-[3px] shrink-0"
                style={{ width: 9, height: 9, background: fundo(e), boxShadow: borda(e) }}
              />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
