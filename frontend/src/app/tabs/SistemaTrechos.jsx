import { Check, Plus, Route, X } from "lucide-react";
import { useState } from "react";
import { descreverSugestaoDePreco } from "../../domain/precos.js";
import { validarValor } from "../../domain/validacao.js";
import { useRouteFares } from "../../hooks/useRouteFares.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Skeleton } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, TextInput, fmtBRL } from "../tabShared.jsx";

const ORIGEM_DA_SUGESTAO = {
  atendente: "dito pelo atendente",
  reservas: "usado nas reservas da equipe",
};

function Sugestao({ sugestao, onRevisar, salvando }) {
  const [valor, setValor] = useState(String(sugestao.price));
  const valido = validarValor(valor, { min: 0.01 }).ok;
  const descricao = descreverSugestaoDePreco(sugestao);
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: C.panel2 }}>
      <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
        {descricao}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
        {ORIGEM_DA_SUGESTAO[sugestao.fonte]}
        {sugestao.evidence_count > 1 ? ` · ${sugestao.evidence_count} vezes` : ""}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <TextInput
          type="number"
          aria-label={`Valor de ${descricao}`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-20 text-xs py-1"
        />
        <button
          type="button"
          disabled={!valido || salvando}
          onClick={() => onRevisar({ id: sugestao.id, aprovar: true, price: Number(valor) })}
          aria-label={`Aprovar ${descricao}`}
          className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md disabled:opacity-40"
          style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
        >
          <Check size={12} /> Aprovar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => onRevisar({ id: sugestao.id, aprovar: false })}
          aria-label={`Recusar ${descricao}`}
          className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
          style={{ color: C.red, border: `1px solid ${C.border}` }}
        >
          <X size={12} /> Recusar
        </button>
      </div>
    </div>
  );
}

/**
 * Sistema → Preços por trecho (issue #239). O valor do bot compara embarque e
 * desembarque nesta tabela. As sugestões vêm do que o atendente responde e das
 * reservas da equipe; só valem depois de aprovadas aqui.
 */
export default function SistemaTrechos() {
  const precos = useRouteFares();
  const [novo, setNovo] = useState({ origem: "", destino: "", preco: "" });
  const [erro, setErro] = useState("");

  const tentar = async (fn, msg) => {
    setErro("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
      return false;
    }
  };
  const adicionar = async () => {
    const ok = await tentar(
      () =>
        precos.salvar({
          origem: novo.origem.trim(),
          destino: novo.destino.trim(),
          price: Number.parseFloat(novo.preco),
        }),
      "Não foi possível salvar o trecho.",
    );
    if (ok) setNovo({ origem: "", destino: "", preco: "" });
  };
  const podeAdicionar =
    novo.origem.trim().length >= 2 &&
    novo.destino.trim().length >= 2 &&
    validarValor(novo.preco, { min: 0.01 }).ok;

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Route size={16} style={{ color: C.inkSoft }} /> Preços por trecho
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Quando o embarque e o desembarque batem com um trecho daqui, nos dois sentidos, o bot usa
        este valor. Trecho em cidade intermediária que não está aqui vai para a equipe.
      </p>

      {erro && (
        <ErrorBanner onDismiss={() => setErro("")} className="mb-3">
          {erro}
        </ErrorBanner>
      )}
      {precos.error && (
        <ErrorBanner onRetry={precos.recarregar} className="mb-3">
          {mensagemAmigavel(precos.error, "Não foi possível carregar os preços por trecho.")}
        </ErrorBanner>
      )}

      {precos.sugestoes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
            Preços que o bot viu, para você aprovar ({precos.sugestoes.length})
          </div>
          <div className="space-y-2">
            {precos.sugestoes.map((s) => (
              <Sugestao
                key={s.id}
                sugestao={s}
                salvando={precos.salvando}
                onRevisar={(decisao) =>
                  tentar(() => precos.revisar(decisao), "Não foi possível salvar (só admin).")
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="form-linha flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label
            htmlFor="trecho-origem"
            className="text-[10px] block"
            style={{ color: C.inkFaint }}
          >
            De
          </label>
          <TextInput
            id="trecho-origem"
            value={novo.origem}
            onChange={(e) => setNovo({ ...novo, origem: e.target.value })}
            placeholder="Ex.: Pirapemas"
            className="w-40"
          />
        </div>
        <div>
          <label
            htmlFor="trecho-destino"
            className="text-[10px] block"
            style={{ color: C.inkFaint }}
          >
            Até
          </label>
          <TextInput
            id="trecho-destino"
            value={novo.destino}
            onChange={(e) => setNovo({ ...novo, destino: e.target.value })}
            placeholder="Ex.: Miranda"
            className="w-40"
          />
        </div>
        <div>
          <label htmlFor="trecho-preco" className="text-[10px] block" style={{ color: C.inkFaint }}>
            Valor (R$)
          </label>
          <TextInput
            id="trecho-preco"
            type="number"
            value={novo.preco}
            onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
            className="w-24"
          />
        </div>
        <button
          type="button"
          onClick={adicionar}
          disabled={!podeAdicionar || precos.salvando}
          aria-label="Adicionar trecho"
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Adicionar / atualizar
        </button>
      </div>

      {precos.loading && precos.trechos.length === 0 ? (
        <div className="space-y-2">
          <Skeleton height={30} rounded={6} />
          <Skeleton height={30} rounded={6} />
        </div>
      ) : precos.trechos.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Nenhum trecho cadastrado.
        </div>
      ) : (
        <div className="space-y-1">
          {precos.trechos.map((t) => (
            <div
              key={t.id}
              className="row-hover flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span style={{ overflowWrap: "anywhere" }}>
                {t.origem} ⇄ {t.destino}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {fmtBRL(t.price)}
                <button
                  className="btn-press w-9 h-9 inline-flex items-center justify-center rounded-lg shrink-0"
                  type="button"
                  onClick={() =>
                    tentar(() => precos.remover(t.id), "Não foi possível remover (só admin).")
                  }
                  aria-label={`remover ${t.origem} ${t.destino}`}
                >
                  <X size={13} style={{ color: C.inkFaint }} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
