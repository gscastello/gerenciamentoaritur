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

/**
 * Abas no topo da tela do grupo. `badges` = { [id]: número }.
 * Visual v18 (issue #446): uma fileira só, que rola de lado no celular, com a linha vermelha
 * embaixo da aba escolhida — o mesmo desenho das abas Ida/Volta da Agenda e da ficha do passageiro.
 */
export function SubAbas({ telas, ativa, onChange, badges = {} }) {
  if (!telas || telas.length < 2) return null;
  return (
    <div className="pt-2 md:pt-4" data-sem-puxao>
      <div
        className="flex gap-6 overflow-x-auto px-4 md:px-10"
        style={{ boxShadow: `inset 0 -1px 0 0 ${C.border}`, scrollbarWidth: "none" }}
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
              onClick={(e) => {
                e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                onChange(t.id);
              }}
              className="relative shrink-0 flex items-center gap-1.5 whitespace-nowrap text-[14.5px] min-h-[46px]"
              style={{
                color: sel ? C.ink : C.inkSoft,
                fontWeight: sel ? 600 : 500,
                transition: "color 120ms var(--ease-out-quart)",
              }}
            >
              {t.label}
              {badge > 0 && (
                <span
                  className="text-[12px] font-semibold tabular-nums"
                  style={{ color: C.inkFaint }}
                >
                  {badge}
                </span>
              )}
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 bottom-0 h-[2px] rounded-full"
                style={{
                  background: C.lanterna,
                  opacity: sel ? 1 : 0,
                  transition: "opacity var(--motion-base) var(--ease-out-quart)",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
