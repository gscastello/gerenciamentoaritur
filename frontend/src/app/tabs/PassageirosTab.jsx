import { ArrowDownWideNarrow, Check, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  GRUPOS,
  ORDENS,
  iniciais,
  ladoDaLinha,
  linhaDeBaixo,
  nomeParaMostrar,
} from "../../domain/crmDoPassageiro.js";
import { usePassageiros, useResumoDosPassageiros } from "../../hooks/usePassageiros.js";
import { FolhaDeBaixo } from "../../ui/FolhaDeBaixo.jsx";
import { Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
import { C, ErrorBanner, Header, TextInput, fmtBRL, todayStr } from "../tabShared.jsx";
import FichaDoPassageiro from "./FichaDoPassageiro.jsx";

/* ============================= 4. PASSAGEIROS / CRM ============================= */
// Visual v18 (issue #446): os números do topo, grupos prontos (sumiram, sem pagamento marcado,
// frequentes…) com a quantidade de cada um, ordenação e a lista; tocar abre a ficha numa tela
// própria (issue #438). Tudo vem do banco (v_customers_stats e fn_resumo_dos_passageiros,
// database/118), página a página, com a busca no servidor.

// Duração da saída antes de tirar o passageiro da lista de verdade — precisa bater com o
// `duration` do Presence abaixo (AGENTS.md §5).
const SAIDA_MS = 200;
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export default function PassageirosTab({ trips, deepLink, onAgendar }) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [ordem, setOrdem] = useState("viagens");
  const [ordenando, setOrdenando] = useState(false);
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
  } = usePassageiros(busca, { grupo, ordem });
  const { resumo } = useResumoDosPassageiros();
  const hoje = todayStr();

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
  const grupoAtual = GRUPOS.find((g) => g.id === grupo) ?? GRUPOS[0];
  const quantos = (id) => (id === "todos" ? resumo?.total : resumo?.grupos?.[id]);
  const mes = MESES[Number(hoje.slice(5, 7)) - 1];

  return (
    <div>
      <Header
        title="Passageiros"
        subtitle="Quem viaja com a AriTur: grupos, números e a ficha de cada um."
      />
      <div className="px-4 md:px-10 pb-10 md:max-w-3xl">
        {erro && (
          <ErrorBanner onRetry={recarregar} className="mb-3">
            {erro}
          </ErrorBanner>
        )}
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: C.inkFaint }}
          />
          <TextInput
            type="search"
            placeholder="Buscar por nome ou telefone…"
            aria-label="Buscar passageiro"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: 40, minHeight: 46, fontSize: 16 }}
          />
        </div>

        {/* os números do topo (v18) */}
        <div
          className="grid grid-cols-3 mt-3 rounded-2xl"
          style={{ background: C.panel }}
          data-testid="numeros-dos-passageiros"
        >
          {[
            [resumo?.viajaram_30d, "viajaram nos últimos 30 dias"],
            [resumo?.novos_no_mes, `primeira viagem em ${mes}`],
            [
              resumo ? fmtBRL(Number(resumo.a_receber || 0)) : null,
              `sem pagamento marcado${resumo?.a_receber_pessoas ? ` (${resumo.a_receber_pessoas} pessoas)` : ""}`,
            ],
          ].map(([valor, rotulo], i) => (
            <div
              key={rotulo}
              className="px-3 py-2.5 min-w-0"
              style={{ boxShadow: i ? `inset 1px 0 0 0 ${C.border}` : "none" }}
            >
              {valor == null ? (
                <Skeleton height={20} width="60%" />
              ) : (
                <b
                  className="block text-[18px] tabular-nums truncate"
                  style={{ color: C.ink, letterSpacing: "-.03em" }}
                >
                  {valor}
                </b>
              )}
              <span className="block text-[12px] leading-tight" style={{ color: C.inkSoft }}>
                {rotulo}
              </span>
            </div>
          ))}
        </div>

        {/* grupos prontos: um botão por grupo, com a quantidade */}
        <div
          role="group"
          aria-label="Grupos de passageiros"
          className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap mt-3"
          style={{ scrollbarWidth: "none" }}
        >
          {GRUPOS.map((g) => {
            const ativo = g.id === grupo;
            const n = quantos(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setGrupo(g.id)}
                className="btn-press shrink-0 min-h-[38px] px-3 rounded-xl text-[13.5px] whitespace-nowrap"
                style={{
                  background: ativo ? C.ink : "transparent",
                  color: ativo ? C.bg : C.inkSoft,
                  fontWeight: ativo ? 600 : 400,
                  boxShadow: ativo ? "none" : `inset 0 0 0 1px ${C.border}`,
                }}
              >
                {g.rotulo}
                {n != null && (
                  <span
                    className="ml-1.5 tabular-nums"
                    style={{ color: ativo ? C.border : C.inkFaint }}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 mt-2.5">
          <p className="text-[12.5px]" style={{ color: C.inkSoft }}>
            {grupoAtual.explicacao}
          </p>
          <button
            type="button"
            onClick={() => setOrdenando(true)}
            className="btn-press shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-1 text-[12.5px] font-semibold"
            style={{ color: C.ink }}
            aria-label="Ordenar a lista"
          >
            <ArrowDownWideNarrow size={15} />
            {ORDENS.find((o) => o.id === ordem)?.rotulo}
          </button>
        </div>
        <p
          className="text-[12.5px] mt-1 mb-1"
          style={{ color: C.inkFaint }}
          data-testid="total-de-passageiros"
        >
          {total} {total === 1 ? "passageiro" : "passageiros"}
        </p>

        <div>
          {loading && passageiros.length === 0 && (
            <div className="space-y-2 mt-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton width={40} height={40} rounded={20} />
                  <div className="flex-1 grid gap-1.5">
                    <Skeleton height={14} width="50%" />
                    <Skeleton height={11} width="35%" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && passageiros.length === 0 && (
            <p className="text-[13.5px] py-6" style={{ color: C.inkSoft }}>
              {busca
                ? `Ninguém encontrado com "${busca}". Busque pelo nome ou por parte do telefone.`
                : grupo === "todos"
                  ? "Nenhum passageiro ainda."
                  : "Ninguém neste grupo agora."}
            </p>
          )}
          {passageiros.map((p) => (
            <Presence
              key={p.customer_id}
              when={!saindo.has(p.customer_id)}
              duration={SAIDA_MS}
              {...fadeScale}
            >
              <LinhaDoPassageiro p={p} hoje={hoje} onAbrir={() => abrir(p)} />
            </Presence>
          ))}
          {loading && passageiros.length > 0 && (
            <div className="py-3" aria-hidden="true">
              <Skeleton height={44} rounded={10} />
            </div>
          )}
          {temMais && !loading && (
            <button
              type="button"
              onClick={carregarMais}
              className="btn-press w-full min-h-[48px] mt-3 rounded-2xl text-[14px] font-semibold"
              style={{ background: C.panel, color: C.ink }}
            >
              Carregar mais ({total - passageiros.length} restantes)
            </button>
          )}
        </div>
      </div>
      <FolhaDeBaixo
        aberta={ordenando}
        onFechar={() => setOrdenando(false)}
        titulo="Ordenar passageiros"
      >
        {ORDENS.map((o) => (
          <button
            key={o.id}
            type="button"
            data-foco-inicial={o.id === ordem ? true : undefined}
            aria-pressed={o.id === ordem}
            onClick={() => {
              setOrdem(o.id);
              setOrdenando(false);
            }}
            className="btn-press w-full flex items-center justify-between min-h-[48px] px-3 rounded-xl text-[15px] text-left"
            style={{
              color: C.ink,
              background: o.id === ordem ? C.panel2 : "transparent",
              fontWeight: o.id === ordem ? 600 : 400,
            }}
          >
            {o.rotulo}
            {o.id === ordem && <Check size={17} />}
          </button>
        ))}
      </FolhaDeBaixo>
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

function LinhaDoPassageiro({ p, hoje, onAbrir }) {
  const nome = nomeParaMostrar(p);
  const lado = ladoDaLinha(p, hoje);
  return (
    <button
      type="button"
      className="btn-press w-full grid items-center gap-3 min-h-[66px] py-2 text-left border-b"
      style={{ gridTemplateColumns: "40px minmax(0,1fr) auto", borderColor: C.panel2 }}
      onClick={onAbrir}
    >
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center text-[13.5px] font-semibold"
        style={{ background: C.border, color: C.inkSoft }}
      >
        {iniciais(nome || p.nome)}
      </span>
      <span className="min-w-0">
        <span
          className="block text-[15px] break-words"
          style={{
            color: nome ? C.ink : C.inkSoft,
            fontWeight: nome ? 600 : 500,
            fontStyle: nome ? "normal" : "italic",
          }}
        >
          {nome || "Sem nome"}
        </span>
        <span className="block text-[12.5px] mt-0.5 break-words" style={{ color: C.inkSoft }}>
          {linhaDeBaixo(p, hoje)}
        </span>
      </span>
      <span className="grid justify-items-end gap-0.5 whitespace-nowrap">
        <b
          className="text-[13.5px] tabular-nums"
          style={{ color: lado.alerta ? C.brandText : C.ink, fontWeight: 600 }}
        >
          {lado.texto}
        </b>
        <span className="text-[12px]" style={{ color: C.inkFaint }}>
          {lado.sub}
        </span>
      </span>
    </button>
  );
}
