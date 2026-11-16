import { ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePassageiros } from "../../hooks/usePassageiros.js";
import { Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, Header, Pill, TextInput, fmtBRL, fmtDate } from "../tabShared.jsx";
import FichaDoPassageiro, { classificacao, iniciaisDe } from "./FichaDoPassageiro.jsx";

/* ============================= 4. PASSAGEIROS / CRM ============================= */
// A lista é só para achar o passageiro: tocar abre a ficha numa tela própria (issue #438), com
// as viagens, os endereços e o cadastro em abas — antes tudo abria dentro da lista.

// Duração da saída antes de tirar o passageiro da lista de verdade — precisa bater com o
// `duration` do Presence abaixo (AGENTS.md §5).
const SAIDA_MS = 200;

// CRM paginado: lista agregada vem do banco (v_customers_stats), página a página, busca no
// servidor. O detalhe de cada passageiro carrega só quando a ficha abre.
export default function PassageirosTab({ trips, deepLink, onAgendar }) {
  const [busca, setBusca] = useState("");
  const [ficha, setFicha] = useState(null);
  const [fichaAberta, setFichaAberta] = useState(false);
  const deepLinkAplicado = useRef(null);
  useEffect(() => {
    if (
      deepLink?.kind === "passageiro" &&
      deepLink.termo &&
      deepLink.at !== deepLinkAplicado.current
    ) {
      deepLinkAplicado.current = deepLink.at;
      setBusca(deepLink.termo);
    }
  }, [deepLink]);

  const {
    passageiros,
    total,
    loading,
    erro,
    temMais,
    carregarMais,
    recarregar,
    atualizarNaLista,
    tirarDaLista,
  } = usePassageiros(busca);
  // acumula com cada "Carregar mais" (usePassageiros.js mantém a lista
  // inteira, não só a página atual) — o rótulo tem que refletir isso.
  const valorCarregado = passageiros.reduce((s, p) => s + Number(p.total_gasto || 0), 0);

  const [saindo, setSaindo] = useState(() => new Set());
  // a ficha removeu o cadastro: a linha sai com transição
  const aoRemover = useCallback(
    (customerId) => {
      setSaindo((prev) => new Set(prev).add(customerId));
      setTimeout(() => tirarDaLista(customerId), SAIDA_MS);
    },
    [tirarDaLista],
  );
  const abrir = (p) => {
    setFicha({ customerId: p.customer_id, inicial: p });
    setFichaAberta(true);
  };
  const fechar = useCallback(() => setFichaAberta(false), []);

  return (
    <div>
      <Header
        title="Passageiros · CRM"
        subtitle="Toque no passageiro para ver as viagens, os endereços e o cadastro."
      />
      <div className="px-4 md:px-10 pb-10">
        {erro && (
          <ErrorBanner onRetry={recarregar} className="mb-3">
            {erro}
          </ErrorBanner>
        )}
        {/* total numa linha (auditoria, issue #397: o cartão de destaque antigo saiu) */}
        <p
          className="text-[13px] mb-3"
          style={{ color: C.inkSoft }}
          data-testid="total-de-passageiros"
        >
          <b style={{ color: C.ink }}>
            {total} {total === 1 ? "passageiro" : "passageiros"}
          </b>{" "}
          · {fmtBRL(valorCarregado)} em passagens · do que mais gerou ao que menos gerou
        </p>
        <div className="relative max-w-sm mb-4">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: C.inkFaint }}
          />
          <TextInput
            placeholder="Buscar por nome ou telefone…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div className="space-y-2 stagger">
          {loading && passageiros.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={64} rounded={12} />
              ))}
            </div>
          )}
          {!loading && passageiros.length === 0 && (
            <Card>
              <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
                {busca ? "Nenhum passageiro para essa busca." : "Nenhum passageiro ainda."}
              </div>
            </Card>
          )}
          {passageiros.map((p) => (
            <Presence
              key={p.customer_id}
              when={!saindo.has(p.customer_id)}
              duration={SAIDA_MS}
              {...fadeScale}
            >
              <LinhaDoPassageiro p={p} onAbrir={() => abrir(p)} />
            </Presence>
          ))}
          {loading && passageiros.length > 0 && (
            <div className="text-center py-3 text-xs" style={{ color: C.inkFaint }}>
              carregando mais…
            </div>
          )}
          {temMais && !loading && (
            <button
              type="button"
              onClick={carregarMais}
              className="btn-press w-full min-h-[44px] rounded-lg text-xs font-medium"
              style={{ background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }}
            >
              Carregar mais ({total - passageiros.length} restantes)
            </button>
          )}
        </div>
      </div>
      <FichaDoPassageiro
        ficha={ficha}
        aberta={fichaAberta}
        onFechar={fechar}
        trips={trips}
        onAgendar={onAgendar}
        onAlterado={atualizarNaLista}
        onRemovido={aoRemover}
      />
    </div>
  );
}

function LinhaDoPassageiro({ p, onAbrir }) {
  return (
    <Card className="anim-fadeUp !p-0">
      <button
        type="button"
        className="btn-press w-full flex items-center gap-3 min-w-0 text-left p-4"
        onClick={onAbrir}
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{
            background: C.amberSoft,
            color: C.brandText,
            border: `1px solid ${C.brandDim}55`,
          }}
        >
          {iniciaisDe(p.nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words">
            {p.nome}{" "}
            <span className="font-normal text-xs" style={{ color: C.inkSoft }}>
              · {p.telefone}
            </span>
          </span>
          <span className="block text-xs mt-0.5 break-words" style={{ color: C.inkSoft }}>
            {p.ultima_data ? `última ${fmtDate(p.ultima_data)}` : "sem viagens"} ·{" "}
            <b style={{ color: C.brandText }}>{fmtBRL(Number(p.total_gasto || 0))}</b> gerados
          </span>
        </span>
        <Pill>{classificacao(p.viagens_count)}</Pill>
        <ChevronRight size={16} style={{ color: C.inkFaint }} className="shrink-0" />
      </button>
    </Card>
  );
}
