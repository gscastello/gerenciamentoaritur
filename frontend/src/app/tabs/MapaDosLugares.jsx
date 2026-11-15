import { fileirasDoVeiculo, ocupacaoDosLugares } from "../../domain/mapaDosLugares.js";
import { C } from "../tabShared.jsx";

/**
 * Mapa dos lugares da Agenda (issue #430), no lugar da barra de lotação: o desenho do veículo da
 * viagem do dia (ônibus de 31 ou van de 15). Confirmados acesos, pendentes riscados, livres vazios.
 * A troca de estado de um lugar é uma transição curta; `prefers-reduced-motion` a desliga (tokens.css).
 */
export default function MapaDosLugares({ capacidade, confirmados, pendentes, direcao }) {
  const fileiras = fileirasDoVeiculo(capacidade);
  const o = ocupacaoDosLugares({ capacidade, confirmados, pendentes });
  const fundo = (e) =>
    e === "confirmado"
      ? C.ink
      : e === "pendente"
        ? `repeating-linear-gradient(135deg, ${C.ink} 0 1.5px, transparent 1.5px 4px)`
        : "transparent";
  const borda = (e) =>
    e === "confirmado" ? "none" : `inset 0 0 0 1.5px ${e === "pendente" ? C.ink : "#3a3c43"}`;
  const casa = (c, i) => {
    if (c.tipo === "corredor") return <span key={`c${i}`} className="block w-2 shrink-0" />;
    if (c.tipo === "porta") return <span key={`p${i}`} className="block w-[13px] shrink-0" />;
    const e = o.estado(c.n);
    return (
      <i
        key={c.n}
        className="block shrink-0 rounded-[4px_4px_3px_3px]"
        data-lugar={e}
        style={{
          width: 13,
          height: 13,
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
        className="relative shrink-0 rounded-[24px_24px_14px_14px] px-3 pt-4 pb-3 grid gap-[5px]"
        style={{ background: "#000", boxShadow: `inset 0 0 0 1px ${C.border}` }}
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
          <div key={i} className="flex gap-[5px]">
            {f.map(casa)}
          </div>
        ))}
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <div
            className="tabular-nums"
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-.035em",
              lineHeight: 1,
              color: C.ink,
            }}
          >
            {o.acesos}
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
            de {o.total} lugares ocupados
          </div>
        </div>
        {[
          ["confirmado", "confirmado"],
          ["pendente", "pendente"],
          ["livre", "livre"],
        ].map(([e, t]) => (
          <div key={e} className="flex items-center gap-2 text-xs" style={{ color: C.inkSoft }}>
            <i
              className="block rounded-[3px] shrink-0"
              style={{ width: 11, height: 11, background: fundo(e), boxShadow: borda(e) }}
            />
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
