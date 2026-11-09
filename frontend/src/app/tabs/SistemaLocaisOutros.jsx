import { MapPin, Plus, X } from "lucide-react";
import { useState } from "react";
import { validarValor } from "../../domain/validacao.js";
import { useLocaisOutros } from "../../hooks/useLocaisOutros.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Skeleton } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, TextInput, fmtBRL } from "../tabShared.jsx";

/**
 * Sistema → Preços de locais em Outros (issue #263). Embarque em Outros cujo local
 * citado bate com um item daqui usa este valor (ex.: dentro do aeroporto, R$ 70);
 * os demais usam o preço de Outros. "Retorno do aeroporto" é o ponto Retorno e
 * nunca pega o preço do aeroporto.
 */
export default function SistemaLocaisOutros() {
  const locais = useLocaisOutros();
  const [novo, setNovo] = useState({ local: "", preco: "" });
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
      () => locais.salvar({ local: novo.local.trim(), price: Number.parseFloat(novo.preco) }),
      "Não foi possível salvar o local (só admin).",
    );
    if (ok) setNovo({ local: "", preco: "" });
  };
  const podeAdicionar = novo.local.trim().length >= 3 && validarValor(novo.preco, { min: 0.01 }).ok;

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin size={16} style={{ color: C.amber }} /> Locais em Outros com preço próprio
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Embarque em Outros cujo local bate com um item daqui usa este valor (o app e o bot). Os
        demais locais usam o preço de Outros. "Retorno do aeroporto" é o ponto Retorno e nunca pega
        o preço do aeroporto.
      </p>

      {erro && (
        <ErrorBanner onDismiss={() => setErro("")} className="mb-3">
          {erro}
        </ErrorBanner>
      )}
      {locais.error && (
        <ErrorBanner onRetry={locais.recarregar} className="mb-3">
          {mensagemAmigavel(locais.error, "Não foi possível carregar os locais.")}
        </ErrorBanner>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label htmlFor="local-outros" className="text-[10px] block" style={{ color: C.inkFaint }}>
            Local
          </label>
          <TextInput
            id="local-outros"
            value={novo.local}
            onChange={(e) => setNovo({ ...novo, local: e.target.value })}
            placeholder="Ex.: Aeroporto"
            className="w-44"
          />
        </div>
        <div>
          <label
            htmlFor="local-outros-preco"
            className="text-[10px] block"
            style={{ color: C.inkFaint }}
          >
            Valor (R$)
          </label>
          <TextInput
            id="local-outros-preco"
            type="number"
            value={novo.preco}
            onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
            className="w-24"
          />
        </div>
        <button
          type="button"
          onClick={adicionar}
          disabled={!podeAdicionar || locais.salvando}
          aria-label="Adicionar local com preço"
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Adicionar / atualizar
        </button>
      </div>

      {locais.loading && locais.locais.length === 0 ? (
        <Skeleton height={30} rounded={6} />
      ) : locais.locais.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Nenhum local com preço próprio.
        </div>
      ) : (
        <div className="space-y-1">
          {locais.locais.map((l) => (
            <div
              key={l.id}
              className="row-hover flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span style={{ overflowWrap: "anywhere" }}>{l.local}</span>
              <span className="flex items-center gap-2 shrink-0">
                {fmtBRL(l.price)}
                <button
                  type="button"
                  onClick={() =>
                    tentar(() => locais.remover(l.id), "Não foi possível remover (só admin).")
                  }
                  aria-label={`remover ${l.local}`}
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
