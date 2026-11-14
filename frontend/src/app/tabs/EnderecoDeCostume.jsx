// Endereço de costume do passageiro recorrente (issue #228): por sentido, o local
// fixado pela equipe ou o mais frequente no histórico, com o atalho "Agendar" que
// abre a nova reserva já preenchida. O cálculo é do banco (rpc_endereco_de_costume).

import { Pencil, Pin, PinOff, Save, X, Zap } from "lucide-react";
import { useState } from "react";
import {
  dataDeAgendamentoValida,
  erroDoFormularioDeCostume,
  formularioDoCostume,
  inicialDoAgendamento,
  origemDoCostume,
  resumoDoCostume,
  sentidoDestacado,
} from "../../domain/enderecoDeCostume.js";
import { useEnderecoDeCostume } from "../../hooks/useEnderecoDeCostume.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Skeleton } from "../../ui/motion/index.js";
import { C, Field, Select, TextInput, dataOperacao, todayStr } from "../tabShared.jsx";

const ROTULO = { ida: "Ida", volta: "Volta" };

const botao = (extra = {}) => ({
  className:
    "btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md disabled:opacity-40",
  style: { background: C.panel, color: C.inkSoft, ...extra },
});

function Sentido({
  direcao,
  costume,
  destaque,
  trips,
  onAgendar,
  onFixar,
  onSoltar,
  ocupado,
  dataOk,
}) {
  const pontos = trips?.[direcao]?.pontos || [];
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState("");

  const abrir = () => {
    setForm(formularioDoCostume(costume, pontos));
    setErro("");
    setEditando(true);
  };
  const ponto = pontos.find((p) => p.id === form?.pontoId);

  const salvar = async () => {
    const problema = erroDoFormularioDeCostume(form, pontos);
    if (problema) {
      setErro(problema);
      return;
    }
    try {
      await onFixar(direcao, {
        pontoId: form.pontoId,
        bairro: ponto?.campo === "bairro" ? form.bairro.trim() : "",
        detalhe: form.detalhe.trim(),
        desembarque: form.desembarque.trim(),
      });
      setEditando(false);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar o endereço de costume."));
    }
  };

  const fixarOHistorico = async () => {
    try {
      await onFixar(direcao, {
        pontoId: costume.route_point_code,
        bairro: costume.neighborhood || "",
        detalhe: costume.detail || "",
        desembarque: costume.dropoff_location || "",
        area: costume.dropoff_area || "",
      });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível fixar o endereço de costume."));
    }
  };

  return (
    <div data-testid={`costume-${direcao}`}>
      <div
        className="text-[10px] uppercase tracking-wide mb-1 flex items-center gap-1.5"
        style={{ color: C.inkFaint }}
      >
        {ROTULO[direcao]}
        {destaque && (
          <span className="normal-case" style={{ color: C.brandText }}>
            · sugerida agora
          </span>
        )}
      </div>

      {editando && form ? (
        <div className="space-y-2">
          {erro && (
            <div className="text-xs" style={{ color: C.red }}>
              {erro}
            </div>
          )}
          <Field label="Ponto de embarque">
            <Select
              value={form.pontoId}
              onChange={(e) => setForm({ ...form, pontoId: e.target.value })}
            >
              {pontos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          {ponto?.campo === "bairro" && (
            <Field label="Bairro">
              <TextInput
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
              />
            </Field>
          )}
          <Field label="Rua / referência">
            <TextInput
              value={form.detalhe}
              onChange={(e) => setForm({ ...form, detalhe: e.target.value })}
            />
          </Field>
          <Field label="Desembarque">
            <TextInput
              value={form.desembarque}
              onChange={(e) => setForm({ ...form, desembarque: e.target.value })}
            />
          </Field>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={ocupado}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <Save size={13} /> Fixar endereço
            </button>
            <button type="button" onClick={() => setEditando(false)} {...botao()}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      ) : costume ? (
        <div className="space-y-2">
          <div className="text-xs leading-snug" style={{ color: C.ink, overflowWrap: "anywhere" }}>
            {resumoDoCostume(costume, pontos)}{" "}
            <span style={{ color: C.inkFaint }}>({origemDoCostume(costume)})</span>
          </div>
          {erro && (
            <div className="text-xs" style={{ color: C.red }}>
              {erro}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {onAgendar && (
              <button
                type="button"
                onClick={() => onAgendar(direcao, costume)}
                disabled={!dataOk}
                className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
                style={{ background: C.amber, color: C.onBrand }}
              >
                <Zap size={13} /> Agendar {ROTULO[direcao]}
              </button>
            )}
            <button type="button" onClick={abrir} {...botao()}>
              <Pencil size={12} /> Editar
            </button>
            {costume.fonte === "manual" ? (
              <button
                type="button"
                onClick={() => onSoltar(direcao)}
                disabled={ocupado}
                {...botao()}
              >
                <PinOff size={12} /> Soltar
              </button>
            ) : (
              <button type="button" onClick={fixarOHistorico} disabled={ocupado} {...botao()}>
                <Pin size={12} /> Fixar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs" style={{ color: C.inkFaint }}>
            — sem endereço de costume —
          </div>
          <button type="button" onClick={abrir} {...botao()}>
            <Pin size={12} /> Fixar endereço
          </button>
        </div>
      )}
    </div>
  );
}

export default function EnderecoDeCostume({ p, trips, onAgendar }) {
  const { costume, sugerido, loading, erro, fixar, soltar } = useEnderecoDeCostume(p.customer_id);
  const [ocupado, setOcupado] = useState(false);
  // data da viagem a agendar: amanhã de partida, mas a equipe escolhe qualquer dia
  const [data, setData] = useState(() => dataOperacao(1));
  const dataOk = dataDeAgendamentoValida(data, todayStr());
  const destaque = sentidoDestacado(sugerido, costume);

  const comTravaDeCliques =
    (fn) =>
    async (...args) => {
      setOcupado(true);
      try {
        return await fn(...args);
      } finally {
        setOcupado(false);
      }
    };

  const agendar = onAgendar
    ? (direcao, c) =>
        onAgendar(
          inicialDoAgendamento({
            cliente: p,
            direcao,
            costume: c,
            trips,
            data,
          }),
        )
    : null;

  return (
    <div className="sm:col-span-2 rounded-lg p-3" style={{ background: C.panel2 }}>
      <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
        Endereço de costume
      </div>
      {erro && (
        <div className="text-xs mb-2" style={{ color: C.red }}>
          {erro}
        </div>
      )}
      {onAgendar && (
        <div className="mb-3 max-w-[11rem]">
          <Field label="Data da viagem">
            <TextInput
              type="date"
              min={todayStr()}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Field>
        </div>
      )}
      {loading && !costume ? (
        <div className="grid sm:grid-cols-2 gap-3" aria-hidden="true">
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {["ida", "volta"].map((d) => (
            <Sentido
              key={d}
              direcao={d}
              costume={costume?.[d] ?? null}
              destaque={destaque === d}
              trips={trips}
              onAgendar={agendar}
              dataOk={dataOk}
              onFixar={comTravaDeCliques(fixar)}
              onSoltar={comTravaDeCliques(soltar)}
              ocupado={ocupado}
            />
          ))}
        </div>
      )}
    </div>
  );
}
