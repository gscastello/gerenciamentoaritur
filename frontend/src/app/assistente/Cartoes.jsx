import { Check, Wrench, X } from "lucide-react";
import { FadeIn, ProgressBar } from "../../ui/motion/index.js";
import { C } from "../tabShared.jsx";

const TITULO_DA_ACAO = {
  criar: "Nova reserva",
  mudar: "Mudar reserva",
  cancelar: "Cancelar reserva",
  lancar_rascunho: "Lançar reserva pronta",
  descartar_rascunho: "Descartar reserva pronta",
  resolver_pendencia: "Fechar pendência",
  // o que o sócio informa ou corrige vira aprendizado do bot (issue #318)
  ensinar: "Ensinar ao bot",
  ensinar_lugar: "Ensinar lugar ao bot",
  // hábito de um passageiro (issue #328)
  costume: "Endereço de costume",
  instruir_cliente: "Instrução sobre o passageiro",
};

const ROTULO_ESTADO = {
  gravando: "Gravando",
  feita: "Feito",
  erro: "Não gravou",
  descartada: "Descartada",
};

/** A primeira linha da proposta é o que decide (dia, sentido, quem); o resto, os detalhes. */
function linhasDaProposta(descricao) {
  const [primeira, ...resto] = String(descricao ?? "").split("\n");
  return { primeira, resto: resto.filter(Boolean) };
}

export function CartaoDeAcao({ acao, onConfirmar, onDescartar }) {
  const aberta = acao.estado === "proposta" || acao.estado === "erro";
  const titulo = TITULO_DA_ACAO[acao.tipo] ?? "Ação";
  const { primeira, resto } = linhasDaProposta(acao.descricao);
  return (
    <FadeIn
      variant="pop"
      data-acao={acao.estado}
      className="rounded-2xl mt-3 overflow-hidden"
      style={{
        background: C.panel2,
        boxShadow: `inset 0 0 0 1px ${acao.estado === "erro" ? C.red : aberta ? C.rubro : C.border}`,
        opacity: acao.estado === "descartada" ? 0.55 : 1,
        transition: "opacity var(--motion-base) var(--ease-out-quart)",
      }}
    >
      <div className="px-4 pt-3.5 pb-3" style={{ overflowWrap: "anywhere" }}>
        <div
          className="flex items-center justify-between gap-2 text-[13px]"
          style={{ color: C.inkSoft }}
        >
          <span>{titulo}</span>
          {acao.estado !== "proposta" && (
            <span
              className="flex items-center gap-1 font-semibold"
              style={{ color: acao.estado === "erro" ? C.red : C.ink }}
            >
              {acao.estado === "feita" && <Check size={14} />}
              {ROTULO_ESTADO[acao.estado] ?? acao.estado}
            </span>
          )}
        </div>
        <div className="text-[16px] font-semibold mt-1 leading-snug" style={{ color: C.ink }}>
          {primeira}
        </div>
        {resto.map((l) => (
          <div key={l} className="text-[14px] mt-0.5 leading-snug" style={{ color: C.inkSoft }}>
            {l}
          </div>
        ))}
        {acao.aviso && (
          <div className="text-[13px] mt-2" style={{ color: C.rota }}>
            {acao.aviso}
          </div>
        )}
        {acao.resultado && (
          <div
            className="text-[13px] mt-2"
            style={{ color: acao.estado === "erro" ? C.red : C.inkSoft }}
          >
            {acao.resultado}
          </div>
        )}
        {acao.estado === "gravando" && (
          <div className="mt-3">
            <ProgressBar label="Gravando no app" />
          </div>
        )}
      </div>
      {aberta && (
        <div className="flex gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={() => onConfirmar(acao)}
            className="btn-press flex-1 flex items-center justify-center gap-2 rounded-xl min-h-[48px] text-[15px] font-semibold"
            style={{ background: C.brand, color: C.onBrand }}
          >
            <Check size={17} /> {acao.estado === "erro" ? "Tentar de novo" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => onDescartar(acao)}
            className="btn-press flex items-center justify-center gap-1.5 rounded-xl min-h-[48px] px-4 text-[15px]"
            style={{ background: C.panel, color: C.inkSoft }}
          >
            <X size={16} /> Descartar
          </button>
        </div>
      )}
    </FadeIn>
  );
}

/** "Registrado para o Claude corrigir": o assistente guardou o erro explicado (issue #516). */
export function CartaoDeCorrecao({ correcao, onDescartar }) {
  return (
    <FadeIn
      variant="pop"
      className="rounded-2xl mt-3 px-4 py-3 flex items-start gap-3"
      style={{ background: C.panel2, opacity: correcao.fora ? 0.55 : 1 }}
    >
      <Wrench size={17} className="shrink-0 mt-0.5" style={{ color: C.inkSoft }} />
      <div className="flex-1 min-w-0" style={{ overflowWrap: "anywhere" }}>
        <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
          {correcao.fora ? "Tirada da fila do Claude" : "Registrado para o Claude corrigir"}
        </div>
        <div className="text-[13px] mt-0.5" style={{ color: C.inkSoft }}>
          {correcao.o_que_errou}
        </div>
        <div className="text-[13px]" style={{ color: C.inkSoft }}>
          Certo: {correcao.o_certo}
        </div>
      </div>
      {!correcao.fora && (
        <button
          type="button"
          onClick={() => onDescartar(correcao.id)}
          aria-label="Tirar da fila do Claude"
          className="btn-press w-11 h-11 -mr-2 -my-1.5 rounded-xl flex items-center justify-center shrink-0"
          style={{ color: C.inkFaint }}
        >
          <X size={16} />
        </button>
      )}
    </FadeIn>
  );
}
