import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatarTelefoneBR } from "../../domain/agendaLinha.js";
import {
  RESPONSAVEIS_BUSCA,
  agruparPorResponsavel,
  diferencasDaBusca,
  moverNaLista,
  moverParaPosicao,
  responsavelDaBusca,
} from "../../domain/buscaEmCasa.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { BUSCA_MODOS, C, enderecoEmbarque } from "../tabShared.jsx";

/**
 * Modo EDITAR da lista "Buscar em casa" (issue #198). Trabalha num rascunho:
 * o dono reordena (setas ou arrastando), seleciona reservas e define quem
 * busca cada uma (Táxi, Gustavo, Maurício ou Ari, cada um na sua cor). Nada é
 * gravado até "Salvar"; "Cancelar" descarta.
 */
export default function BuscaEmCasaEditor({ itens, trips, onSalvar, onFechar }) {
  const original = useMemo(() => itens.map((r) => r.id), [itens]);
  const modosOriginais = useMemo(
    () => Object.fromEntries(itens.map((r) => [r.id, responsavelDaBusca(r)])),
    [itens],
  );
  const porId = useMemo(() => Object.fromEntries(itens.map((r) => [r.id, r])), [itens]);

  const [ordem, setOrdem] = useState(original);
  const [modos, setModos] = useState(modosOriginais);
  const [sel, setSel] = useState(() => new Set());
  const [arrastando, setArrastando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const dif = diferencasDaBusca({ original, ordem, modosOriginais, modos });
  const alterado = !!dif.ordem || dif.atribuicoes.length > 0;

  const alternar = (id) =>
    setSel((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const atribuir = (modo) => {
    setModos((atual) => ({ ...atual, ...Object.fromEntries([...sel].map((id) => [id, modo])) }));
    setSel(new Set()); // pronto para selecionar o próximo grupo
  };
  const agrupar = () => setOrdem((atual) => agruparPorResponsavel(atual, (id) => modos[id]));

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await onSalvar(dif);
      onFechar();
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar a lista."));
      setSalvando(false);
    }
  };

  const botao = {
    background: C.panel2,
    color: C.inkSoft,
    border: `1px solid ${C.border}`,
  };

  return (
    <div className="space-y-2 mb-1.5">
      <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: C.panel2 }}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: C.inkSoft }}>
          <span className="font-semibold" style={{ color: C.ink }}>
            {sel.size} selecionada(s)
          </span>
          <button
            type="button"
            onClick={() => setSel(new Set(ordem))}
            className="btn-press px-2 py-1 rounded-md"
            style={botao}
          >
            Selecionar todas
          </button>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            disabled={sel.size === 0}
            className="btn-press px-2 py-1 rounded-md disabled:opacity-40"
            style={botao}
          >
            Limpar seleção
          </button>
          <button
            type="button"
            onClick={agrupar}
            className="btn-press px-2 py-1 rounded-md"
            style={botao}
          >
            Agrupar por quem busca
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px]" style={{ color: C.inkSoft }}>
            Quem busca os selecionados:
          </span>
          {RESPONSAVEIS_BUSCA.map((modo) => {
            const m = BUSCA_MODOS[modo];
            return (
              <button
                key={modo}
                type="button"
                disabled={sel.size === 0}
                onClick={() => atribuir(modo)}
                aria-label={`Atribuir a ${m.label}`}
                className="btn-press inline-flex items-center gap-1 rounded-full text-[12px] font-semibold px-2.5 py-1 disabled:opacity-40"
                style={{ background: `${m.cor}22`, color: m.cor, border: `1px solid ${m.cor}88` }}
              >
                <m.Icon size={12} /> {m.label}
              </button>
            );
          })}
        </div>
        {erro && (
          <div
            className="text-xs rounded-md px-2 py-1.5"
            style={{ background: C.redSoft, color: C.red }}
          >
            {erro}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: alterado ? C.warn : C.inkFaint }}>
            {alterado ? "Alterações ainda não salvas" : "Sem alterações"}
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
              <Check size={13} /> {salvando ? "Salvando…" : "Salvar"}
            </button>
          </span>
        </div>
      </div>

      <ul className="space-y-1.5">
        {ordem.map((id, i) => {
          const r = porId[id];
          if (!r) return null;
          const m = BUSCA_MODOS[modos[id]];
          const selecionada = sel.has(id);
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
              className="flex items-stretch gap-1.5 rounded-md pl-2 pr-1.5 py-2"
              style={{
                background: `${m.cor}14`,
                borderLeft: `3px solid ${m.cor}`,
                outline: selecionada ? `2px solid ${m.cor}` : "none",
                opacity: arrastando === id ? 0.5 : 1,
              }}
            >
              <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selecionada}
                  onChange={() => alternar(id)}
                  aria-label={`Selecionar ${r.nome}`}
                />
                <span
                  className="text-[11px] font-bold mt-1 shrink-0"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: C.inkFaint }}
                >
                  {i + 1}
                </span>
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
                  <span
                    className="inline-flex items-center gap-1 mt-1 rounded-full text-[11px] font-semibold px-2 py-0.5"
                    style={{
                      background: `${m.cor}22`,
                      color: m.cor,
                      border: `1px solid ${m.cor}66`,
                    }}
                  >
                    <m.Icon size={11} /> {m.label}
                  </span>
                </span>
              </label>
              <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                <GripVertical size={14} style={{ color: C.inkFaint }} aria-hidden="true" />
                <button
                  type="button"
                  aria-label={`Subir ${r.nome}`}
                  disabled={i === 0}
                  onClick={() => setOrdem(moverNaLista(ordem, id, -1))}
                  className="btn-press w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-30"
                  style={botao}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${r.nome}`}
                  disabled={i === ordem.length - 1}
                  onClick={() => setOrdem(moverNaLista(ordem, id, 1))}
                  className="btn-press w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-30"
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
