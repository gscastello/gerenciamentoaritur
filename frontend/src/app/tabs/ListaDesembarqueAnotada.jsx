// src/app/tabs/ListaDesembarqueAnotada.jsx
//
// Lista do Dia → Desembarque: anotar à mão, durante a viagem, onde cada
// passageiro desce (issue #383). Começa em branco e não muda a reserva (decisão
// do dono). Funciona sem internet: grava no aparelho e envia quando o sinal volta.

import { Check, CloudOff, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useListaDesembarque } from "../../hooks/useListaDesembarque.js";
import { FadeIn, Presence, Spinner, fadeScale } from "../../ui/motion/index.js";
import { C, Card, SubTabs } from "../tabShared.jsx";

const horaEmSaoLuis = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Fortaleza",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );

function Estado({ estado }) {
  if (estado === "enviando" || estado === "carregando") {
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: C.inkFaint }}>
        <Spinner size={11} /> {estado === "enviando" ? "Enviando" : "Abrindo"}
      </span>
    );
  }
  if (estado === "pendente" || estado === "sem_internet") {
    return (
      <span
        className="flex items-center gap-1.5 text-[11px] font-semibold"
        style={{ color: C.ink }}
        data-testid="estado-da-lista"
      >
        <CloudOff size={12} />
        {estado === "pendente" ? "No aparelho · envia quando a internet voltar" : "Sem internet"}
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: C.inkFaint }}
      data-testid="estado-da-lista"
    >
      <Check size={12} /> Salvo
    </span>
  );
}

function Linha({ linha, ordem, onAlternar, onEditar, onApagar }) {
  const [editando, setEditando] = useState(false);
  return (
    <li
      className="flex items-center gap-2 rounded-lg pl-1 pr-1.5 py-1"
      style={{ background: C.panel2 }}
      data-testid="linha-desembarque"
    >
      <button
        type="button"
        onClick={() => onAlternar(linha.id)}
        aria-pressed={linha.feito}
        aria-label={`${linha.feito ? "Desmarcar" : "Marcar"} ${linha.texto}`}
        className="btn-press shrink-0 w-11 h-11 grid place-items-center rounded-lg"
      >
        <span
          className="w-5 h-5 rounded-md grid place-items-center"
          style={{
            border: `1.5px solid ${linha.feito ? C.ink : C.inkFaint}`,
            background: linha.feito ? C.ink : "transparent",
            transition: "background 120ms var(--ease-out-quart)",
          }}
        >
          {linha.feito && <Check size={13} strokeWidth={3} style={{ color: C.bg }} />}
        </span>
      </button>
      <span className="tabular-nums text-xs shrink-0" style={{ color: C.inkFaint }}>
        {ordem}.
      </span>
      {editando ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: abriu a edição com um toque na linha
          autoFocus
          defaultValue={linha.texto}
          aria-label="Editar anotação"
          maxLength={200}
          onBlur={(e) => {
            setEditando(false);
            if (e.target.value.trim() !== linha.texto) onEditar(linha.id, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditando(false);
          }}
          className="flex-1 min-w-0 text-[15px] rounded-md px-2 py-2 outline-none"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex-1 min-w-0 text-left text-[15px] py-2 leading-snug"
          style={{
            color: linha.feito ? C.inkFaint : C.ink,
            textDecoration: linha.feito ? "line-through" : "none",
            overflowWrap: "anywhere",
          }}
        >
          {linha.texto}
        </button>
      )}
      <button
        type="button"
        onClick={() => onApagar(linha.id)}
        aria-label={`Apagar ${linha.texto}`}
        className="btn-press shrink-0 w-11 h-11 grid place-items-center rounded-lg"
        style={{ color: C.inkFaint }}
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

export default function ListaDesembarqueAnotada({ data }) {
  const [direcao, setDirecao] = useState(() => (horaEmSaoLuis() < 10 ? "ida" : "volta"));
  const lista = useListaDesembarque(data, direcao);
  const [texto, setTexto] = useState("");
  const idCampo = useId();

  const anotar = (e) => {
    e.preventDefault();
    if (lista.adicionar(texto)) setTexto("");
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <NotebookPen size={16} style={{ color: C.inkSoft }} /> Anotar desembarque
        </div>
        <Estado estado={lista.estado} />
      </div>
      <SubTabs
        value={direcao}
        onChange={setDirecao}
        options={[
          { id: "ida", label: "Ida" },
          { id: "volta", label: "Volta" },
        ]}
      />
      <form onSubmit={anotar} className="flex gap-2 mt-3">
        <label htmlFor={idCampo} className="sr-only">
          Onde o passageiro desce
        </label>
        <input
          id={idCampo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={200}
          enterKeyHint="done"
          placeholder="Ex.: 2P — Cohatrac, em frente à padaria"
          className="flex-1 min-w-0 text-[15px] rounded-lg px-3 py-2.5 outline-none"
          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.ink }}
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          className="btn-press shrink-0 flex items-center gap-1.5 text-sm font-semibold px-3.5 rounded-lg disabled:opacity-50"
          style={{ background: C.brand, color: C.onBrand, minHeight: 44 }}
        >
          <Plus size={16} /> Anotar
        </button>
      </form>
      {lista.linhas.length === 0 ? (
        <p className="text-xs mt-3" style={{ color: C.inkFaint }}>
          Nada anotado na {direcao === "ida" ? "Ida" : "Volta"} deste dia. Escreva onde cada
          passageiro desce; marque quando ele descer. Não muda a reserva.
        </p>
      ) : (
        <>
          <ol
            className="list-none space-y-1.5 mt-3"
            aria-label="Anotações de desembarque"
            data-testid="lista-desembarque-anotada"
          >
            {/* todas passam aqui: a apagada sai com transição em vez de sumir */}
            {lista.todas.map((l) => (
              <Presence key={l.id} when={!l.apagada} duration={200} {...fadeScale}>
                <FadeIn>
                  <Linha
                    linha={l}
                    ordem={lista.linhas.findIndex((x) => x.id === l.id) + 1 || "–"}
                    onAlternar={lista.alternar}
                    onEditar={lista.editar}
                    onApagar={lista.apagar}
                  />
                </FadeIn>
              </Presence>
            ))}
          </ol>
          <p className="text-[11px] mt-2 tabular-nums" style={{ color: C.inkFaint }}>
            {lista.resumo.total} anotado(s) · {lista.resumo.feitas} desceu(ram)
          </p>
        </>
      )}
    </Card>
  );
}
