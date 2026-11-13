// src/app/SubAbas.jsx
//
// Telas juntas (issue #360): Financeiro + Gestão + Operação viram uma tela
// ("Gestão") e Atendimento + Pendências outra ("Atendimento"), com abas no topo.
// Cada aba continua sendo a tela de sempre (mesmo id, papel e links), só o menu
// mostra um item por grupo.

import { C } from "./tabShared.jsx";

/** Grupos de telas: o item do menu (`nav`) abre a primeira tela permitida. */
const GRUPOS_DE_TELAS = [
  {
    nav: "financeiro",
    telas: [
      { id: "financeiro", label: "Financeiro" },
      { id: "gestao", label: "Gestão" },
      { id: "operacao", label: "Operação" },
      { id: "vencimentos", label: "Vencimentos" },
    ],
  },
  {
    nav: "atendimento",
    telas: [
      { id: "atendimento", label: "Conversas" },
      { id: "para_lancar", label: "Para lançar" },
      { id: "pendencias", label: "Pendências" },
      { id: "bot", label: "Bot" },
    ],
  },
];

/** O grupo da tela (ou null se ela é sozinha). */
export function grupoDaTela(id) {
  return GRUPOS_DE_TELAS.find((g) => g.telas.some((t) => t.id === id)) ?? null;
}

/** Abas no topo da tela do grupo. `badges` = { [id]: número }. */
export function SubAbas({ telas, ativa, onChange, badges = {} }) {
  if (!telas || telas.length < 2) return null;
  return (
    <div
      className="px-3.5 md:px-10 pt-3 flex gap-1 overflow-x-auto"
      role="tablist"
      aria-label="Telas"
      data-sem-puxao
    >
      {telas.map((t) => {
        const sel = t.id === ativa;
        const badge = badges[t.id] ?? 0;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.id)}
            className="btn-press shrink-0 flex items-center gap-1.5 text-[13px] md:text-sm px-3 min-h-[40px] md:px-3.5 rounded-lg font-semibold"
            style={{
              background: sel ? C.panel2 : "transparent",
              color: sel ? C.ink : C.inkSoft,
              border: `1px solid ${sel ? C.border : "transparent"}`,
              transition:
                "background 120ms var(--ease-out-quart), color 120ms var(--ease-out-quart)",
            }}
          >
            {t.label}
            {badge > 0 && (
              <span className="text-[11px] font-semibold" style={{ color: C.inkFaint }}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
