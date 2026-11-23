// src/app/VeiculoDoDia.jsx
//
// Veículo do dia (issue #502). A faixa no topo pergunta qual veículo roda (amanhã a partir das 14h; hoje
// enquanto a viagem não saiu): um toque confirma os sentidos que faltam e acerta os lugares. Sem a
// confirmação, o bot sozinho só vende até 19. Na Operação, a lista de hoje e amanhã abre e fecha as vendas.

import { Bus } from "lucide-react";
import { useState } from "react";
import { diasAConfirmar, sentidosDoDia, viagensDeHojeEAmanha } from "../domain/veiculoDoDia.js";
import { useVehicles } from "../hooks/useVehicles.js";
import { useViagensDoPeriodo } from "../hooks/useViagensDoPeriodo.js";
import { mensagemAmigavel } from "../lib/erros.js";
import { Presence, Spinner, fadeSlideDown } from "../ui/motion/index.js";
import { C, fmtDate, todayStr } from "./tabShared.jsx";

const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Fortaleza",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function momento(agora) {
  const hoje = todayStr();
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { hoje, amanha: d.toISOString().slice(0, 10), hora: fmtHora.format(agora) };
}
const rotulo = (d) => (d === "ida" ? "Ida" : "Volta");

/** Faixa "Qual veículo roda amanhã?" para quem agenda. */
export function ConfirmarVeiculoDoDia({ agora = new Date() }) {
  const { vehicles, defaultVehicle } = useVehicles();
  const { viagens, confirmarVeiculo } = useViagensDoPeriodo(defaultVehicle);
  const [salvando, setSalvando] = useState(null);
  const [erro, setErro] = useState("");
  const [dia] = diasAConfirmar(viagens, momento(agora));
  const ativos = (vehicles ?? []).filter((v) => v.active !== false);

  const confirmar = async (veiculo) => {
    setSalvando(veiculo.id);
    setErro("");
    try {
      for (const t of dia.viagens) await confirmarVeiculo(t.trip_date, t.direction, veiculo.id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível confirmar o veículo."));
    }
    setSalvando(null);
  };

  return (
    <Presence when={!!dia && ativos.length > 0} {...fadeSlideDown}>
      {dia && (
        <section
          data-testid="confirmar-veiculo"
          className="mx-4 md:mx-10 mt-4 rounded-2xl border px-3.5 py-3"
          style={{ borderColor: C.amber, background: C.amberSoft }}
        >
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: C.ink }}>
            <Bus size={17} style={{ color: C.amber }} />
            Qual veículo roda {dia.quando}, {fmtDate(dia.data)}? ({sentidosDoDia(dia.viagens)})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ativos.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!!salvando}
                onClick={() => confirmar(v)}
                className="btn-press flex items-center gap-2 text-[13px] px-3.5 min-h-[44px] rounded-xl border font-semibold disabled:opacity-50"
                style={{ background: C.panel, borderColor: C.border, color: C.ink }}
              >
                {salvando === v.id && <Spinner />}
                {v.name} · {v.capacity}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: C.inkSoft }}>
            Sem confirmar, o bot sozinho só vende até 19 lugares.
          </p>
          {erro && (
            <p className="mt-1 text-xs font-semibold" style={{ color: C.red }} role="alert">
              {erro}
            </p>
          )}
        </section>
      )}
    </Presence>
  );
}

/** Operação: hoje e amanhã, o veículo de cada viagem e as vendas do bot. */
export function VendasDasViagens({ viagens, vehicles, fecharVendas, agora = new Date() }) {
  const [salvando, setSalvando] = useState(null);
  const [erro, setErro] = useState("");
  const lista = viagensDeHojeEAmanha(viagens, momento(agora)).filter((t) => t.id);
  if (lista.length === 0) return null;

  const mudar = async (t) => {
    setSalvando(t.id);
    setErro("");
    try {
      await fecharVendas(t.id, !t.sales_closed_at);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível mudar as vendas."));
    }
    setSalvando(null);
  };

  return (
    <div className="mt-4" data-testid="vendas-das-viagens">
      <div className="text-sm font-semibold mb-1">Vendas do bot</div>
      <ul className="divide-y" style={{ borderColor: C.border }}>
        {lista.map((t) => {
          const fechada = !!t.sales_closed_at;
          const veiculo = vehicles.find((v) => v.id === t.vehicle_id);
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              style={{ borderColor: C.border }}
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">
                  {rotulo(t.direction)} · {fmtDate(t.trip_date)}
                </div>
                <div className="text-xs" style={{ color: C.inkSoft }}>
                  {veiculo?.name ?? "Veículo"} · {t.capacity} lugares ·{" "}
                  {t.vehicle_confirmed_at ? "confirmado" : "a confirmar"}
                  {fechada ? " · vendas fechadas" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={!!salvando}
                onClick={() => mudar(t)}
                className="btn-press flex items-center gap-2 text-[13px] px-3.5 min-h-[44px] rounded-xl border font-semibold disabled:opacity-50"
                style={{
                  background: C.panel,
                  borderColor: fechada ? C.red : C.border,
                  color: C.ink,
                }}
              >
                {salvando === t.id && <Spinner />}
                {fechada ? "Abrir vendas" : "Fechar vendas"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs mt-1" style={{ color: C.inkFaint }}>
        Fechar impede o bot de vender sozinho. A equipe e o Agendado continuam lançando.
      </p>
      {erro && (
        <p className="text-xs font-semibold mt-1" style={{ color: C.red }} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
