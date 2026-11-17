import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  andarMes,
  descricaoDoDia,
  diasDaSemana,
  fracaoOcupada,
  gradeDoMes,
  nomeCurtoDoDia,
  nomeDoMes,
  quaseCheia,
  rotuloDoDia,
} from "../../domain/semanaDaAgenda.js";
import { FolhaDeBaixo } from "../../ui/FolhaDeBaixo.jsx";
import { C } from "../tabShared.jsx";

// Semana no topo da Agenda e o calendário do mês (issue #446, simulação v18 aprovada pelo dono).
// Cada dia mostra duas barrinhas: a de cima é a Ida, a de baixo a Volta; vermelho = 90% ou mais.

function Barrinhas({ ida, volta, capIda, capVolta, escolhido = false }) {
  const trilho = escolhido ? "#D8D3D1" : C.border;
  const barra = (pax, cap) => {
    const cheia = quaseCheia(pax, cap);
    const cor = cheia ? (escolhido ? C.brand : C.lanterna) : escolhido ? C.bg : C.inkSoft;
    return (
      <i
        className="block h-[3px] rounded-full overflow-hidden"
        style={{ background: trilho }}
        data-cheia={cheia ? "1" : undefined}
      >
        <b
          className="block h-full rounded-full"
          style={{ width: `${Math.round(fracaoOcupada(pax, cap) * 100)}%`, background: cor }}
        />
      </i>
    );
  };
  return (
    <span aria-hidden="true" className="grid gap-[2px] w-[22px] mt-0.5">
      {barra(ida, capIda)}
      {barra(volta, capVolta)}
    </span>
  );
}

/** Os sete dias da semana do dia escolhido, com a lotação de cada um. */
export function SemanaDaAgenda({ data, hoje, lotacao, capDe, onEscolher }) {
  const dias = diasDaSemana(data);
  return (
    <div
      role="group"
      aria-label="Dias da semana"
      data-testid="semana-da-agenda"
      className="grid grid-cols-7 gap-0.5 -mx-1.5 md:max-w-md"
    >
      {dias.map((d) => {
        const l = lotacao[d] ?? { ida: 0, volta: 0 };
        const capIda = capDe(d, "ida");
        const capVolta = capDe(d, "volta");
        const escolhido = d === data;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={escolhido}
            aria-label={descricaoDoDia(d, hoje, { ...l, capIda, capVolta })}
            data-dia={d}
            onClick={() => onEscolher(d)}
            className="btn-press grid justify-items-center gap-px rounded-xl pt-1 pb-[7px] min-h-[54px]"
            style={{ background: escolhido ? C.panel2 : "transparent" }}
          >
            <span className="text-[11.5px]" style={{ color: escolhido ? C.ink : C.inkSoft }}>
              {d === hoje ? "hoje" : nomeCurtoDoDia(d)}
            </span>
            <span
              className="text-[16px] font-semibold leading-tight tabular-nums"
              style={{ color: d < hoje ? C.inkFaint : C.ink }}
            >
              {Number(d.slice(8, 10))}
            </span>
            <Barrinhas {...l} capIda={capIda} capVolta={capVolta} />
          </button>
        );
      })}
    </div>
  );
}

/** "Agenda" e o dia escolhido; tocar no dia ou no botão do calendário abre o mês inteiro. */
export function TituloDoDia({ data, hoje, onAbrirCalendario, comTitulo = true }) {
  const rotulo = rotuloDoDia(data, hoje);
  return (
    <div
      className="flex items-center gap-1 min-w-0 flex-1"
      data-testid="dia-da-agenda"
      data-dia={data}
    >
      <div className="min-w-0 flex-1">
        {comTitulo && (
          <div
            className="truncate"
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-.01em",
              lineHeight: 1.2,
              color: C.ink,
            }}
          >
            Agenda
          </div>
        )}
        <button
          type="button"
          onClick={onAbrirCalendario}
          aria-label={`${rotulo}. Escolher outro dia`}
          className="relative inline-flex items-center gap-1 max-w-full text-left min-h-[24px] whitespace-nowrap"
          style={{
            color: comTitulo ? C.inkSoft : C.ink,
            fontSize: comTitulo ? 12.5 : 15,
            fontWeight: comTitulo ? 400 : 600,
          }}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
      </div>
      <button
        type="button"
        onClick={onAbrirCalendario}
        aria-label="Abrir o calendário do mês"
        className="btn-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ color: C.inkSoft }}
      >
        <CalendarDays size={20} />
      </button>
    </div>
  );
}

/** O mês inteiro numa folha de baixo, com a lotação de cada dia. */
export function CalendarioDoMes({ aberto, onFechar, data, hoje, lotacao, capDe, onEscolher }) {
  const [mes, setMes] = useState(() => ({
    ano: Number(data.slice(0, 4)),
    mes: Number(data.slice(5, 7)),
  }));
  const [abriuEm, setAbriuEm] = useState(data);
  // reabriu em outro dia: o calendário volta para o mês dele
  if (aberto && abriuEm !== data) {
    setAbriuEm(data);
    setMes({ ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)) });
  }
  const semanas = useMemo(() => gradeDoMes(mes.ano, mes.mes), [mes]);
  const escolher = (d) => {
    onEscolher(d);
    onFechar();
  };
  const titulo = nomeDoMes(mes.ano, mes.mes);
  return (
    <FolhaDeBaixo
      aberta={aberto}
      onFechar={onFechar}
      titulo="Escolher o dia"
      subtitulo="Toque num dia para abrir a Agenda nele"
      testId="calendario-do-mes"
    >
      <div className="flex items-center justify-between px-0.5 pb-1.5">
        <button
          type="button"
          onClick={() => setMes((m) => andarMes(m, -1))}
          aria-label="Mês anterior"
          className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ color: C.inkSoft }}
        >
          <ChevronLeft size={20} />
        </button>
        <span
          className="text-[16px] font-semibold first-letter:uppercase"
          style={{ color: C.ink }}
          aria-live="polite"
        >
          {titulo}
        </span>
        <button
          type="button"
          onClick={() => setMes((m) => andarMes(m, 1))}
          aria-label="Próximo mês"
          className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ color: C.inkSoft }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 px-1.5" aria-hidden="true">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as letras se repetem; a posição é fixa
          <span key={i} className="text-center text-[12px] pb-1" style={{ color: C.inkFaint }}>
            {l}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 px-1.5" role="group" aria-label={titulo}>
        {semanas.flat().map((d, i) => {
          if (!d) return <span key={`v${i}`} />;
          const l = lotacao[d] ?? { ida: 0, volta: 0 };
          const capIda = capDe(d, "ida");
          const capVolta = capDe(d, "volta");
          const escolhido = d === data;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={escolhido}
              aria-current={d === hoje ? "date" : undefined}
              aria-label={descricaoDoDia(d, hoje, { ...l, capIda, capVolta })}
              data-dia={d}
              onClick={() => escolher(d)}
              className="btn-press grid justify-items-center content-center gap-[3px] rounded-xl min-h-[50px]"
              style={{
                background: escolhido ? C.ink : "transparent",
                boxShadow: d === hoje && !escolhido ? `inset 0 0 0 1.5px ${C.inkSoft}` : "none",
              }}
            >
              <span
                className="text-[15px] tabular-nums"
                style={{
                  color: escolhido ? C.bg : d < hoje ? C.inkFaint : C.ink,
                  fontWeight: d < hoje && !escolhido ? 500 : 600,
                }}
              >
                {Number(d.slice(8, 10))}
              </span>
              <Barrinhas {...l} capIda={capIda} capVolta={capVolta} escolhido={escolhido} />
            </button>
          );
        })}
      </div>
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pt-3 pb-2 text-[12px]"
        style={{ color: C.inkFaint }}
      >
        <span className="inline-flex items-center gap-2">
          <Barrinhas ida={18} volta={12} capIda={31} capVolta={31} />
          em cima a Ida, embaixo a Volta
        </span>
        <span className="inline-flex items-center gap-2">
          <Barrinhas ida={30} volta={29} capIda={31} capVolta={31} />
          quase cheia
        </span>
      </div>
      <div className="flex items-center gap-2 px-2 pt-1">
        <button
          type="button"
          data-foco-inicial
          onClick={() => escolher(hoje)}
          className="btn-press flex-1 min-h-[48px] rounded-2xl text-[15px] font-semibold"
          style={{ background: C.border, color: C.ink }}
        >
          Voltar para hoje
        </button>
        <label
          className="relative flex items-center gap-2 min-h-[48px] px-4 rounded-2xl text-[14px]"
          style={{ background: C.panel2, color: C.inkSoft }}
        >
          Outra data
          <input
            type="date"
            value={data}
            aria-label="Ir para a data"
            onChange={(e) => e.target.value && escolher(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* sem showPicker: o toque no campo já abre o seletor do aparelho */
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ colorScheme: "dark" }}
          />
        </label>
      </div>
    </FolhaDeBaixo>
  );
}
