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
      { id: "extrato", label: "Extrato" },
      { id: "fechamento", label: "Fechamento" },
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
  // issue #399: grade de colunas iguais no celular (3 por linha quando são mais de 4), todas
  // à vista e alinhadas; a aba ativa acende com o filete vermelho embaixo
  // telas estreitas: duas colunas para nenhum nome quebrar em duas linhas
  const colunas =
    telas.length <= 3
      ? "grid-cols-3"
      : telas.length === 4
        ? "grid-cols-2 min-[400px]:grid-cols-4"
        : "grid-cols-2 min-[360px]:grid-cols-3";
  return (
    <div className="px-4 md:px-10 pt-4" data-sem-puxao>
      <div
        className={`grid ${colunas} md:flex md:flex-wrap gap-1 rounded-xl border p-1 md:w-fit`}
        style={{
          background: C.panel,
          borderColor: C.border,
        }}
        role="tablist"
        aria-label="Telas"
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
              className="btn-press relative flex items-center justify-center gap-1.5 text-[13px] md:text-sm leading-tight text-center px-2 md:px-3.5 min-h-[40px] rounded-lg font-semibold"
              style={{
                background: sel ? C.panel2 : "transparent",
                color: sel ? C.ink : C.inkSoft,
                boxShadow: sel ? `inset 0 -2px 0 ${C.brand}` : "none",
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
    </div>
  );
}
