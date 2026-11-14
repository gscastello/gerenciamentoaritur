// src/app/tabs/EscalaDoVeiculo.jsx
//
// Van reserva por DIA (issue #408): na Operação, tocar num veículo pede o dia e o sentido em
// que ele roda. Só aquela viagem muda de veículo e de lugares (ônibus 31, van 15); as outras
// continuam no veículo padrão. O banco recusa se a viagem já tem mais passageiros do que o
// veículo leva (rpc_veiculo_da_viagem). Embaixo, as viagens marcadas com outro veículo.

import { Bus } from "lucide-react";
import { useState } from "react";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Presence, Spinner, fadeSlideDown } from "../../ui/motion/index.js";
import { C, SubTabs, TextInput, fmtDate, todayStr } from "../tabShared.jsx";

const SENTIDOS = [
  { id: "ida", label: "Ida" },
  { id: "volta", label: "Volta" },
  { id: "ambos", label: "Ida e Volta" },
];
const rotuloSentido = (d) => (d === "ida" ? "Ida" : "Volta");

/** Painel "Usar <veículo> em: dia + sentido" (aberto quando `veiculo` existe). */
export function EscalarVeiculo({ veiculo, padrao, trocarVeiculo, onFechar }) {
  const [data, setData] = useState(todayStr());
  const [sentido, setSentido] = useState("ambos");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok: string[], erros: string[] }

  const aplicar = async () => {
    if (!veiculo || !data) return;
    setSalvando(true);
    setResultado(null);
    const ok = [];
    const erros = [];
    for (const dir of sentido === "ambos" ? ["ida", "volta"] : [sentido]) {
      try {
        await trocarVeiculo(data, dir, veiculo.id);
        ok.push(rotuloSentido(dir));
      } catch (e) {
        erros.push(
          `${rotuloSentido(dir)}: ${mensagemAmigavel(e, "não foi possível trocar o veículo.")}`,
        );
      }
    }
    setSalvando(false);
    setResultado({ ok, erros });
  };

  return (
    <Presence when={!!veiculo} {...fadeSlideDown}>
      {(_estado, estilo) => (
        <div
          className="mt-3 rounded-xl border p-3 space-y-3"
          style={{ ...estilo, background: C.panel2, borderColor: C.border }}
          data-testid="escalar-veiculo"
        >
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Bus size={14} style={{ color: C.inkSoft }} />
            Usar {veiculo?.name} ({veiculo?.capacity} lugares) em:
          </div>
          <div className="grid sm:grid-cols-[minmax(0,180px)_auto] gap-2 items-center">
            <TextInput
              type="date"
              aria-label="Dia da viagem"
              value={data}
              min={todayStr()}
              onChange={(e) => {
                setData(e.target.value);
                setResultado(null);
              }}
            />
            <SubTabs
              value={sentido}
              onChange={(v) => {
                setSentido(v);
                setResultado(null);
              }}
              options={SENTIDOS}
            />
          </div>
          <p className="text-xs" style={{ color: C.inkSoft }}>
            Só essa viagem muda: as outras continuam no {padrao?.name ?? "veículo padrão"}. Se a
            viagem já tiver mais passageiros do que esse veículo leva, o app avisa e não troca.
          </p>
          {resultado?.ok.length > 0 && (
            <div className="text-xs font-semibold" style={{ color: C.green }} role="status">
              {veiculo?.name} em {fmtDate(data)}: {resultado.ok.join(" e ")}.
            </div>
          )}
          {resultado?.erros.map((e) => (
            <div key={e} className="text-xs font-semibold" style={{ color: C.red }} role="alert">
              {e}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={aplicar}
              disabled={salvando || !data}
              className="btn-press flex-1 sm:flex-none flex items-center justify-center gap-2 text-[13px] px-4 min-h-[44px] rounded-xl font-semibold disabled:opacity-50"
              style={{ background: C.brand, color: C.onBrand }}
            >
              {salvando && <Spinner />}
              Usar neste dia
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="btn-press text-[13px] px-4 min-h-[44px] rounded-xl border font-semibold"
              style={{ background: C.panel, borderColor: C.border, color: C.ink }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </Presence>
  );
}

/** Viagens marcadas com outro veículo que não o padrão, com "voltar ao padrão". */
export function ViagensForaDoPadrao({ foraDoPadrao, vehicles, padrao, trocarVeiculo }) {
  const [voltando, setVoltando] = useState(null);
  const [erro, setErro] = useState("");
  if (!padrao || foraDoPadrao.length === 0) return null;
  const nome = (id) => vehicles.find((v) => v.id === id)?.name ?? "Outro veículo";

  const voltar = async (t) => {
    setErro("");
    setVoltando(t.id);
    try {
      await trocarVeiculo(t.trip_date, t.direction, padrao.id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível voltar ao veículo padrão."));
    }
    setVoltando(null);
  };

  return (
    <div className="mt-4" data-testid="viagens-fora-do-padrao">
      <div className="text-xs font-semibold mb-2" style={{ color: C.inkSoft }}>
        Viagens com outro veículo
      </div>
      {erro && (
        <div className="text-xs font-semibold mb-2" style={{ color: C.red }} role="alert">
          {erro}
        </div>
      )}
      <ul className="space-y-1.5">
        {foraDoPadrao.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: C.border, background: C.panel2 }}
          >
            <div className="min-w-0 text-[13px]">
              <span className="font-semibold tabular-nums">{fmtDate(t.trip_date)}</span> ·{" "}
              {rotuloSentido(t.direction)} · {nome(t.vehicle_id)} ({t.capacity} lugares)
            </div>
            <button
              type="button"
              onClick={() => voltar(t)}
              disabled={voltando === t.id}
              className="btn-press shrink-0 flex items-center gap-1.5 text-xs px-3 min-h-[40px] rounded-lg border font-semibold disabled:opacity-50"
              style={{ background: C.panel, borderColor: C.border, color: C.ink }}
            >
              {voltando === t.id && <Spinner />}
              Voltar ao {padrao.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
