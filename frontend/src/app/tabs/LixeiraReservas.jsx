import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { mensagemDeRestauracao, reservasNaLixeira } from "../../domain/lixeira.js";
import {
  C,
  Card,
  TextInput,
  enderecoEmbarque,
  fmtBRL,
  fmtDate,
  tempoRelativo,
} from "../tabShared.jsx";

const DIAS_NA_LIXEIRA = 30;

/**
 * Lixeira da Agenda (issue #206): as reservas canceladas dos últimos 30 dias,
 * com "Restaurar" para desfazer um cancelamento por engano. Cancelar nunca
 * apaga nada — a reserva só muda de status —, então restaurar é seguro.
 */
export default function LixeiraReservas({ reservas, trips, onRestaurar }) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [restaurando, setRestaurando] = useState(null);

  const lista = useMemo(
    () => reservasNaLixeira(reservas, { dias: DIAS_NA_LIXEIRA, busca }),
    [reservas, busca],
  );
  const total = useMemo(
    () => reservasNaLixeira(reservas, { dias: DIAS_NA_LIXEIRA }).length,
    [reservas],
  );

  const restaurar = async (r) => {
    if (!window.confirm(mensagemDeRestauracao(r, r.data ? fmtDate(r.data) : ""))) return;
    setRestaurando(r.id);
    try {
      await onRestaurar(r.id);
    } finally {
      setRestaurando(null);
    }
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Trash2 size={15} style={{ color: C.inkSoft }} /> Lixeira — reservas canceladas
          <span
            className="text-[11px] font-semibold rounded-full px-2 py-0.5"
            style={{ background: C.panel2, color: C.inkSoft }}
          >
            {total}
          </span>
        </span>
        {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {aberta && (
        <div className="mt-3 space-y-2">
          <p className="text-xs" style={{ color: C.inkSoft }}>
            Canceladas nos últimos {DIAS_NA_LIXEIRA} dias. Cancelar não apaga nada: use{" "}
            <b>Restaurar</b> para desfazer um cancelamento por engano.
          </p>
          <TextInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            aria-label="Buscar na lixeira"
            className="text-xs py-1.5"
          />
          {lista.length === 0 && (
            <div className="text-xs py-3 text-center" style={{ color: C.inkFaint }}>
              {busca ? "Nenhuma reserva cancelada encontrada." : "A lixeira está vazia."}
            </div>
          )}
          <ul className="space-y-1.5">
            {lista.map((r) => (
              <li
                key={r.id}
                className="rounded-md px-3 py-2 flex items-start justify-between gap-3"
                style={{ background: C.panel2 }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
                    {r.nome || "—"}
                    <span className="font-normal" style={{ color: C.inkSoft }}>
                      {r.quantidade > 1 ? ` · ${r.quantidade}P` : ""}
                      {r.valorTotal ? ` · ${fmtBRL(r.valorTotal)}` : ""}
                    </span>
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
                  >
                    {r.data ? `${fmtDate(r.data)} · ` : ""}
                    {r.direcao === "volta" ? "Volta" : r.direcao === "ida" ? "Ida" : r.tipo}
                    {enderecoEmbarque(r, trips) ? ` · ${enderecoEmbarque(r, trips)}` : ""}
                  </div>
                  <div className="text-[11px]" style={{ color: C.inkFaint }}>
                    {r.telefone}
                    {r.canceladaEm ? ` · cancelada ${tempoRelativo(r.canceladaEm)}` : ""}
                    {r.canceladaPor ? ` por ${r.canceladaPor}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restaurar(r)}
                  disabled={restaurando === r.id}
                  aria-label={`Restaurar ${r.nome}`}
                  className="btn-press shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-semibold disabled:opacity-40"
                  style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
                >
                  <RotateCcw size={13} /> {restaurando === r.id ? "Restaurando…" : "Restaurar"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
