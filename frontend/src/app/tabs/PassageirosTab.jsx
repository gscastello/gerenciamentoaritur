import { AlertTriangle, ChevronRight, MessageCircle, Pencil, Save, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { primeiroErro, validarNome, validarTelefone } from "../../domain/validacao.js";
import { usePassageiroDetalhe, usePassageiros } from "../../hooks/usePassageiros.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  C,
  Card,
  Field,
  Header,
  HeroFX,
  Pill,
  Select,
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

  const { passageiros, total, loading, erro, temMais, carregarMais, salvarNota, salvarPerfil } =
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
              onSalvarPerfil={salvarPerfil}
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

const ROTULO_PAGAMENTO = { dinheiro: "Dinheiro", pix: "Pix" };

function PassageiroCard({ p, trips, aberto, onToggle, onSalvarNota, onSalvarPerfil }) {
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
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrirEdicao = () => {
    setForm({
      nome: p.nome || "",
      telefone: p.telefone || "",
      pontoPadrao: p.ponto_padrao || "",
      pagamentoPadrao: p.pagamento_padrao || "",
    });
    setErroForm("");
    setEditando(true);
  };

  const salvarEdicao = async () => {
    const problema = primeiroErro([validarNome(form.nome), validarTelefone(form.telefone)]);
    if (problema) {
      setErroForm(problema);
      return;
    }
    setSalvando(true);
    try {
      await onSalvarPerfil(p.customer_id, {
        name: form.nome.trim(),
        phone: digitos(form.telefone),
        defaultRoutePointCode: form.pontoPadrao || null,
        defaultPaymentMethod: form.pagamentoPadrao || null,
      });
      setEditando(false);
    } catch (e) {
      setErroForm(mensagemAmigavel(e, "Não foi possível salvar o cadastro."));
    } finally {
      setSalvando(false);
    }
  };

  const tel = digitos(p.telefone);
  const iniciais = (p.nome || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="anim-fadeUp">
      <div className="w-full flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
          onClick={onToggle}
        >
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
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!aberto) onToggle();
              abrirEdicao();
            }}
            aria-label={`Editar cadastro de ${p.nome}`}
            className="btn-press p-1.5 rounded-md"
            style={{ color: C.inkFaint }}
          >
            <Pencil size={13} />
          </button>
          <Pill>{classificacao(p.viagens_count)}</Pill>
          <button type="button" onClick={onToggle} aria-label={aberto ? "Recolher" : "Expandir"}>
            <ChevronRight
              size={14}
              style={{
                color: C.inkFaint,
                transform: aberto ? "rotate(90deg)" : "none",
                transition: "transform .15s",
              }}
            />
          </button>
        </div>
      </div>
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
          <div className="sm:col-span-2 rounded-lg p-3" style={{ background: C.panel2 }}>
            {editando && form ? (
              <>
                <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
                  Editar cadastro
                </div>
                {erroForm && (
                  <div className="text-xs mb-2" style={{ color: C.red }}>
                    {erroForm}
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-2">
                  <Field label="Nome">
                    <TextInput
                      value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    />
                  </Field>
                  <Field label="Telefone">
                    <TextInput
                      inputMode="tel"
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    />
                  </Field>
                  <Field label="Ponto de embarque padrão (opcional)">
                    <Select
                      value={form.pontoPadrao}
                      onChange={(e) => setForm({ ...form, pontoPadrao: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      {(trips?.ida?.pontos || []).map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Pagamento padrão (opcional)">
                    <Select
                      value={form.pagamentoPadrao}
                      onChange={(e) => setForm({ ...form, pagamentoPadrao: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">Pix</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={salvarEdicao}
                    disabled={salvando}
                    className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
                    style={{ background: C.amber, color: C.onBrand }}
                  >
                    <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    disabled={salvando}
                    className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
                    style={{ background: C.panel, color: C.inkSoft }}
                  >
                    <X size={13} /> Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: C.inkSoft }}>
                <span>
                  Ponto padrão:{" "}
                  <b style={{ color: C.ink }}>
                    {(trips?.ida?.pontos || []).find((pt) => pt.id === p.ponto_padrao)?.nome ||
                      "não definido"}
                  </b>
                </span>
                <span>
                  Pagamento padrão:{" "}
                  <b style={{ color: C.ink }}>
                    {ROTULO_PAGAMENTO[p.pagamento_padrao] || "não definido"}
                  </b>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
