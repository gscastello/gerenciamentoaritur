// Histórico de viagens do passageiro no CRM (issue #436): cada viagem com a data, o sentido, o
// embarque e o desembarque, as passagens, o valor e a situação. A regra está em
// domain/historicoDoPassageiro.js; aqui só a lista.
import { useMemo, useState } from "react";
import { historicoDoPassageiro } from "../../domain/historicoDoPassageiro.js";
import { Skeleton, Stagger } from "../../ui/motion/index.js";
import { C, enderecoEmbarque, fmtBRL, todayStr } from "../tabShared.jsx";

const PRIMEIRAS = 10;

function LinhaDaViagem({ v, trips, primeira }) {
  const embarque = enderecoEmbarque(v, trips) || v.bairro || "";
  const cancelada = v.status === "cancelada" || v.status === "nao_compareceu";
  return (
    <div
      className={`py-2 grid gap-0.5 ${primeira ? "" : "border-t"}`}
      style={{ borderColor: C.borderSoft }}
      data-testid="viagem-do-historico"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: C.ink }}>
          {v.quando}
          <span className="font-medium" style={{ color: C.inkSoft }}>
            {" "}
            · {v.sentido}
            {v.encomenda ? " · Encomenda" : ""}
          </span>
        </span>
        <span
          className="text-[11px] font-semibold px-1.5 rounded shrink-0"
          style={{ background: C.panel2, color: cancelada ? C.inkFaint : C.inkSoft }}
        >
          {v.situacao}
        </span>
      </div>
      <div
        className="text-xs leading-snug"
        style={{
          color: cancelada ? C.inkFaint : C.inkSoft,
          overflowWrap: "anywhere",
          textDecoration: v.status === "cancelada" ? "line-through" : "none",
        }}
      >
        {embarque || "embarque não informado"}
        {v.desembarque ? ` → ${v.desembarque}` : ""}
        {!v.encomenda && ` · ${v.quantidade || 1}P`}
        {v.valor ? <span className="tabular-nums"> · {fmtBRL(v.valor)}</span> : null}
      </div>
    </div>
  );
}

function Grupo({ titulo, itens, trips }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: C.inkFaint }}>
        {titulo} · {itens.length}
      </div>
      <Stagger>
        {itens.map((v, i) => (
          <LinhaDaViagem key={v.id} v={v} trips={trips} primeira={i === 0} />
        ))}
      </Stagger>
    </div>
  );
}

export default function HistoricoDeViagens({ viagens, loading, trips }) {
  const [todas, setTodas] = useState(false);
  const { proximas, anteriores, total } = useMemo(
    () => historicoDoPassageiro(viagens, todayStr()),
    [viagens],
  );
  // as próximas sempre aparecem inteiras; das anteriores, as 10 mais recentes até tocar em "Ver todas"
  const limite = Math.max(PRIMEIRAS - proximas.length, 3);
  const anterioresVisiveis = todas ? anteriores : anteriores.slice(0, limite);

  return (
    <section className="sm:col-span-2" aria-label="Histórico de viagens">
      <div className="text-xs font-semibold mb-1" style={{ color: C.ink }}>
        Histórico de viagens
      </div>
      {loading ? (
        <div className="space-y-1.5" data-testid="historico-carregando">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={40} rounded={8} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Nenhuma viagem ainda.
        </div>
      ) : (
        <div className="space-y-2">
          <Grupo titulo="Próximas" itens={proximas} trips={trips} />
          <Grupo titulo="Anteriores" itens={anterioresVisiveis} trips={trips} />
          {anteriores.length > anterioresVisiveis.length && (
            <button
              type="button"
              onClick={() => setTodas(true)}
              className="btn-press w-full min-h-[44px] rounded-lg text-xs font-medium"
              style={{ background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }}
            >
              Ver todas ({anteriores.length - anterioresVisiveis.length} anteriores)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
