import { AlertTriangle, ChevronRight, MessageCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePassageiroDetalhe, usePassageiros } from "../../hooks/usePassageiros.js";
import {
  C,
  Card,
  Field,
  Header,
  HeroFX,
  Pill,
  TextInput,
  digitos,
  enderecoEmbarque,
  enderecosFrequentes,
  fmtBRL,
  fmtDate,
  inputCls,
  inputStyle,
} from "../tabShared.jsx";

/* ============================= 4. PASSAGEIROS / CRM ============================= */
// Endereços mais usados pelo passageiro numa direção — a mudança de
// desembarque é comum, então ter o histórico à mão ajuda o atendimento.
function EnderecosFreq({ titulo, itens }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.inkFaint }}>
        {titulo}
      </div>
      {itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          — sem histórico —
        </div>
      ) : (
        <ul className="space-y-1">
          {itens.map((e) => (
            <li
              key={e.texto}
              className="text-xs leading-snug flex items-start gap-1.5"
              style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
            >
              <span style={{ color: C.ink }}>{e.texto}</span>
              {e.n > 1 && <span style={{ color: C.inkFaint }}>×{e.n}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// CRM paginado: lista agregada vem do banco (v_customers_stats), página
// a página, busca no servidor. O histórico de cada passageiro (para os
// endereços mais usados) carrega só quando o card abre.
export default function PassageirosTab({ trips, deepLink }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);
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

  const { passageiros, total, loading, erro, temMais, carregarMais, salvarNota } =
    usePassageiros(busca);
  const valorPagina = passageiros.reduce((s, p) => s + Number(p.total_gasto || 0), 0);

  return (
    <div>
      <Header
        title="Passageiros · CRM"
        subtitle="Histórico, valor gerado e notas de atendimento por cliente."
      />
      <div className="px-6 md:px-10 pb-10">
        {erro && (
          <div
            className="mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
          </div>
        )}
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 mb-4 flex flex-wrap items-center justify-between gap-4"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative">
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: "1.2rem",
                color: "#fff",
              }}
            >
              {total} {total === 1 ? "passageiro" : "passageiros"}
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,.75)" }}>
              ordenados por valor gerado
            </div>
          </div>
          <div className="relative">
            <div
              className="text-[10px] uppercase tracking-wide"
              style={{ color: "rgba(255,255,255,.6)" }}
            >
              Valor gerado (nesta página)
            </div>
            <div
              style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}
            >
              {fmtBRL(valorPagina)}
            </div>
          </div>
        </div>
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
          {!loading && passageiros.length === 0 && (
            <Card>
              <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
                {busca ? "Nenhum passageiro para essa busca." : "Nenhum passageiro ainda."}
              </div>
            </Card>
          )}
          {passageiros.map((p) => (
            <PassageiroCard
              key={p.customer_id}
              p={p}
              trips={trips}
              aberto={aberto === p.customer_id}
              onToggle={() => setAberto(aberto === p.customer_id ? null : p.customer_id)}
              onSalvarNota={salvarNota}
            />
          ))}
          {loading && (
            <div className="text-center py-3 text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </div>
          )}
          {temMais && !loading && (
            <button
              type="button"
              onClick={carregarMais}
              className="btn-press w-full py-2.5 rounded-lg text-xs font-medium"
              style={{ background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }}
            >
              Carregar mais ({total - passageiros.length} restantes)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function classificacao(viagensCount) {
  if (viagensCount >= 5) return "Frequente";
  if (viagensCount >= 2) return "Recorrente";
  return "Novo";
}

function PassageiroCard({ p, trips, aberto, onToggle, onSalvarNota }) {
  const { viagens, loading } = usePassageiroDetalhe(aberto ? p.customer_id : null);
  const enderecosIda = useMemo(
    () =>
      enderecosFrequentes(
        viagens.filter((v) => v.direcao === "ida"),
        (v) => enderecoEmbarque(v, trips) || v.bairro,
      ),
    [viagens, trips],
  );
  const enderecosVolta = useMemo(
    () =>
      enderecosFrequentes(
        viagens.filter((v) => v.direcao === "volta"),
        (v) => v.desembarque || enderecoEmbarque(v, trips),
      ),
    [viagens, trips],
  );
  const tel = digitos(p.telefone);
  const iniciais = (p.nome || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="anim-fadeUp">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left gap-3"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: C.amberSoft,
              color: C.brand,
              fontFamily: "'Space Grotesk', sans-serif",
              border: `1px solid ${C.brandDim}55`,
            }}
          >
            {iniciais}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate">
              {p.nome}{" "}
              <span className="font-normal text-xs" style={{ color: C.inkSoft }}>
                · {p.telefone}
              </span>
            </span>
            <span className="block text-xs mt-0.5 truncate" style={{ color: C.inkSoft }}>
              {p.ultima_data ? `última ${fmtDate(p.ultima_data)}` : "sem viagens"} ·{" "}
              <b style={{ color: C.brand }}>{fmtBRL(Number(p.total_gasto || 0))}</b> gerados
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Pill>{classificacao(p.viagens_count)}</Pill>
          <ChevronRight
            size={14}
            style={{
              color: C.inkFaint,
              transform: aberto ? "rotate(90deg)" : "none",
              transition: "transform .15s",
            }}
          />
        </div>
      </button>
      {aberto && (
        <div
          className="anim-slideDown mt-3 pt-3 border-t grid sm:grid-cols-2 gap-3"
          style={{ borderColor: C.borderSoft }}
        >
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-3">
            <EnderecosFreq titulo="Embarque (ida)" itens={loading ? [] : enderecosIda} />
            <EnderecosFreq titulo="Desembarque (volta)" itens={loading ? [] : enderecosVolta} />
          </div>
          <div className="text-xs space-y-1" style={{ color: C.inkSoft }}>
            <div>
              Passagens: <b style={{ color: C.ink }}>{p.total_passagens}</b>
            </div>
            <div>
              Viagens: <b style={{ color: C.ink }}>{p.viagens_count}</b>
            </div>
            <div>
              Cancelamentos: <b style={{ color: C.ink }}>{p.cancelamentos}</b>
            </div>
            <div>
              Não compareceu: <b style={{ color: C.ink }}>{p.nao_compareceu}</b>
            </div>
            {tel && (
              <button
                type="button"
                onClick={() => window.open(`https://wa.me/55${tel}`, "_blank")}
                className="btn-press mt-2 flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                style={{ background: C.panel2, color: C.inkSoft }}
              >
                <MessageCircle size={12} /> Abrir WhatsApp
              </button>
            )}
          </div>
          <div>
            <Field label="Notas do CRM">
              <textarea
                key={p.customer_id}
                defaultValue={p.notes || ""}
                onBlur={(e) =>
                  e.target.value !== (p.notes || "") && onSalvarNota(p.customer_id, e.target.value)
                }
                rows={4}
                className={inputCls}
                style={inputStyle}
                placeholder="Preferências, observações, combinados…"
              />
            </Field>
          </div>
        </div>
      )}
    </Card>
  );
}
