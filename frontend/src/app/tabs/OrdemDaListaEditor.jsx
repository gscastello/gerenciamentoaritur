import { ArrowDown, ArrowUp, Check, ChevronsUp, GripVertical, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatarTelefoneBR } from "../../domain/agendaLinha.js";
import { moverNaLista, moverParaIndice, moverParaPosicao } from "../../domain/buscaEmCasa.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { C, enderecoEmbarque } from "../tabShared.jsx";

/**
 * Reordenação rápida de uma seção da Lista do Dia (issue #212). Trabalha num
 * rascunho: arrastar, setas, "topo" ou digitar a posição de destino. Nada é
 * gravado até "Salvar"; "Cancelar" descarta.
 */
export default function OrdemDaListaEditor({ itens, trips, onSalvar, onFechar }) {
  const original = useMemo(() => itens.map((r) => r.id), [itens]);
  const porId = useMemo(() => Object.fromEntries(itens.map((r) => [r.id, r])), [itens]);
  const [ordem, setOrdem] = useState(original);
  const [arrastando, setArrastando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const alterado = ordem.some((id, i) => id !== original[i]);

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await onSalvar(ordem);
      onFechar();
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar a ordem."));
      setSalvando(false);
    }
  };

  const botao = { background: C.panel, color: C.inkSoft, border: `1px solid ${C.border}` };
  const miniBtn =
    "btn-press w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-30";

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2"
        style={{ background: C.panel2 }}
      >
        <span className="text-[11px]" style={{ color: alterado ? C.warn : C.inkFaint }}>
          {alterado
            ? "Ordem alterada — ainda não salva"
            : "Arraste, use as setas ou digite a posição"}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="btn-press flex items-center gap-1 text-xs px-3 py-1.5 rounded-md"
            style={botao}
          >
            <X size={13} /> Cancelar edição
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!alterado || salvando}
            className="btn-press flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <Check size={13} /> {salvando ? "Salvando…" : "Salvar ordem"}
          </button>
        </span>
      </div>
      {erro && (
        <div
          className="text-xs rounded-md px-2 py-1.5"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}
      <ul className="space-y-1.5">
        {ordem.map((id, i) => {
          const r = porId[id];
          if (!r) return null;
          const tel2 = r.telefone2 ? ` / ${formatarTelefoneBR(r.telefone2)}` : "";
          return (
            <li
              key={id}
              draggable
              onDragStart={() => setArrastando(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastando && arrastando !== id)
                  setOrdem(moverParaPosicao(ordem, arrastando, id));
                setArrastando(null);
              }}
              onDragEnd={() => setArrastando(null)}
              className="flex items-stretch gap-2 rounded-md pl-2 pr-1.5 py-2"
              style={{ background: C.panel2, opacity: arrastando === id ? 0.5 : 1 }}
            >
              <input
                type="number"
                min={1}
                max={ordem.length}
                key={`${id}:${i}`}
                defaultValue={i + 1}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => setOrdem(moverParaIndice(ordem, id, e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                aria-label={`Posição de ${r.nome}`}
                className="w-12 shrink-0 self-center text-center text-[14px] font-bold rounded-md py-1.5 outline-none"
                style={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  color: C.ink,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[15px] font-bold leading-snug"
                  style={{ color: C.ink, overflowWrap: "anywhere" }}
                >
                  {r.quantidade > 1 ? `${r.quantidade}P · ` : ""}
                  {enderecoEmbarque(r, trips) || "endereço não informado"}
                </span>
                <span className="block text-[13px] font-semibold" style={{ color: C.inkSoft }}>
                  {r.nome || "—"}
                </span>
                <span className="block text-[12px]" style={{ color: C.inkFaint }}>
                  {formatarTelefoneBR(r.telefone)}
                  {tel2}
                </span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <GripVertical size={14} style={{ color: C.inkFaint }} aria-hidden="true" />
                <button
                  type="button"
                  aria-label={`Mover ${r.nome} para o topo`}
                  disabled={i === 0}
                  onClick={() => setOrdem(moverParaIndice(ordem, id, 1))}
                  className={miniBtn}
                  style={botao}
                >
                  <ChevronsUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Subir ${r.nome}`}
                  disabled={i === 0}
                  onClick={() => setOrdem(moverNaLista(ordem, id, -1))}
                  className={miniBtn}
                  style={botao}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${r.nome}`}
                  disabled={i === ordem.length - 1}
                  onClick={() => setOrdem(moverNaLista(ordem, id, 1))}
                  className={miniBtn}
                  style={botao}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
