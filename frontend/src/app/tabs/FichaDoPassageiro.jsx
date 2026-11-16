// Ficha do passageiro (issue #438): o CRM de cada passageiro numa tela própria — no celular a
// tela inteira, no computador um painel —, aberta pela lista de Passageiros ou pela Agenda
// ("⋯" → Ver passageiro). Abas para não juntar tudo numa rolagem só: Viagens, Endereços e
// Cadastro.
import { ChevronLeft, MessageCircle, Pencil, Phone, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FORMAS_PAGAMENTO, rotuloPagamento } from "../../domain/format.js";
import { primeiroErro, validarNome, validarTelefone } from "../../domain/validacao.js";
import { usePassageiro } from "../../hooks/usePassageiros.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton } from "../../ui/motion/index.js";
import {
  C,
  ErrorBanner,
  Field,
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
import EnderecoDeCostume from "./EnderecoDeCostume.jsx";
import HistoricoDeViagens from "./HistoricoDeViagens.jsx";

const ABAS = [
  { id: "viagens", rotulo: "Viagens" },
  { id: "enderecos", rotulo: "Endereços" },
  { id: "cadastro", rotulo: "Cadastro" },
];

const ENTRADA = {
  enter: { opacity: 1, transform: "translateY(0)" },
  exit: { opacity: 0, transform: "translateY(16px)" },
};

export function classificacao(viagensCount) {
  if (viagensCount >= 5) return "Frequente";
  if (viagensCount >= 2) return "Recorrente";
  return "Novo";
}

export function iniciaisDe(nome) {
  return (nome || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Endereços que o passageiro mais usa num sentido — a mudança de desembarque é comum, então ter o
// histórico à mão ajuda o atendimento.
function EnderecosFreq({ titulo, itens, loading }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.inkFaint }}>
        {titulo}
      </div>
      {loading ? (
        <Skeleton height={36} rounded={8} />
      ) : itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Sem histórico.
        </div>
      ) : (
        <ul className="space-y-1">
          {itens.map((e) => (
            <li
              key={e.texto}
              className="text-[13px] leading-snug flex items-start gap-1.5"
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

function Numero({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <div className="text-[15px] font-semibold tabular-nums truncate" style={{ color: C.ink }}>
        {valor}
      </div>
      <div className="text-[11px]" style={{ color: C.inkFaint }}>
        {rotulo}
      </div>
    </div>
  );
}

function Cadastro({ p, trips, onSalvarNota, onSalvarPerfil, onRemover }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pontos = trips?.ida?.pontos || [];

  const abrirEdicao = () => {
    setForm({
      nome: p.nome || "",
      telefone: p.telefone || "",
      telefone2: p.telefone2 || "",
      pontoPadrao: p.ponto_padrao || "",
      pagamentoPadrao: p.pagamento_padrao || "",
    });
    setErroForm("");
    setEditando(true);
  };

  const salvarEdicao = async () => {
    const problema = primeiroErro([
      validarNome(form.nome),
      validarTelefone(form.telefone),
      form.telefone2.trim() ? validarTelefone(form.telefone2) : null,
    ]);
    if (problema) {
      setErroForm(problema);
      return;
    }
    setSalvando(true);
    try {
      await onSalvarPerfil({
        name: form.nome.trim(),
        phone: validarTelefone(form.telefone).valor,
        phoneSecondary: form.telefone2.trim() ? validarTelefone(form.telefone2).valor : null,
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

  const removerCadastro = async () => {
    if (
      !window.confirm(
        `Remover o cadastro de ${p.nome}? O histórico de viagens é mantido, mas o passageiro some da lista.`,
      )
    )
      return;
    setSalvando(true);
    try {
      await onRemover();
    } catch (e) {
      setErroForm(mensagemAmigavel(e, "Não foi possível remover o passageiro."));
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Notas do CRM">
        <textarea
          key={p.customer_id}
          defaultValue={p.notes || ""}
          onBlur={(e) => e.target.value !== (p.notes || "") && onSalvarNota(e.target.value)}
          rows={4}
          className={inputCls}
          style={inputStyle}
          placeholder="Preferências, observações, combinados…"
        />
      </Field>
      <div className="rounded-xl p-3" style={{ background: C.panel2 }}>
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
              <Field label="Telefone secundário (opcional)">
                <TextInput
                  inputMode="tel"
                  value={form.telefone2}
                  onChange={(e) => setForm({ ...form, telefone2: e.target.value })}
                />
              </Field>
              <Field label="Ponto de embarque padrão (opcional)">
                <Select
                  value={form.pontoPadrao}
                  onChange={(e) => setForm({ ...form, pontoPadrao: e.target.value })}
                >
                  <option value="">— nenhum —</option>
                  {pontos.map((pt) => (
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
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={salvarEdicao}
                disabled={salvando}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg font-medium disabled:opacity-40"
                style={{ background: C.amber, color: C.onBrand }}
              >
                <Save size={14} /> {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                disabled={salvando}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg"
                style={{ background: C.panel, color: C.inkSoft }}
              >
                <X size={14} /> Cancelar
              </button>
              <button
                type="button"
                onClick={removerCadastro}
                disabled={salvando}
                aria-label={`Remover cadastro de ${p.nome}`}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg ml-auto disabled:opacity-40"
                style={{ background: C.redSoft, color: C.red }}
              >
                <Trash2 size={14} /> Remover cadastro
              </button>
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <div className="text-[13px] grid gap-1" style={{ color: C.inkSoft }}>
              <span>
                Ponto padrão:{" "}
                <b style={{ color: C.ink }}>
                  {pontos.find((pt) => pt.id === p.ponto_padrao)?.nome || "não definido"}
                </b>
              </span>
              <span>
                Pagamento padrão:{" "}
                <b style={{ color: C.ink }}>
                  {p.pagamento_padrao ? rotuloPagamento(p.pagamento_padrao) : "não definido"}
                </b>
              </span>
              {p.telefone2 && (
                <span>
                  2º telefone: <b style={{ color: C.ink }}>{p.telefone2}</b>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={abrirEdicao}
              className="btn-press justify-self-start flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg font-medium"
              style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
            >
              <Pencil size={14} /> Editar cadastro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Conteudo({
  customerId,
  inicial,
  abaInicial,
  trips,
  onFechar,
  onAgendar,
  onAlterado,
  onRemovido,
}) {
  const {
    p,
    carregando,
    erro,
    tentarDeNovo,
    viagens,
    carregandoViagens,
    salvarNota,
    salvarPerfil,
    remover,
  } = usePassageiro(customerId, { inicial });
  const [aba, setAba] = useState(abaInicial);
  const voltar = useRef(null);
  useEffect(() => {
    voltar.current?.focus();
  }, []);

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

  const tel = digitos(p?.telefone);
  const nota = async (texto) => onAlterado?.(customerId, await salvarNota(texto));
  const perfil = async (campos) => onAlterado?.(customerId, await salvarPerfil(campos));
  const removerEFechar = async () => {
    await remover();
    onRemovido?.(customerId);
    onFechar();
  };

  return (
    <>
      <header
        className="flex-none border-b"
        style={{
          borderColor: C.border,
          background: C.panel,
          paddingTop: "max(8px, env(safe-area-inset-top, 0px))",
        }}
      >
        <div className="flex items-center gap-2 px-2 pt-1">
          <button
            ref={voltar}
            type="button"
            onClick={onFechar}
            aria-label="Voltar"
            className="btn-press toque-at flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
            style={{ color: C.ink }}
          >
            <ChevronLeft size={22} />
          </button>
          {p ? (
            <div className="min-w-0 flex-1">
              <h2
                className="text-[17px] font-semibold leading-tight break-words"
                style={{ color: C.ink }}
              >
                {p.nome || p.telefone}
              </h2>
              <div className="text-xs tabular-nums" style={{ color: C.inkSoft }}>
                {p.telefone}
                {p.ultima_data ? ` · última ${fmtDate(p.ultima_data)}` : " · sem viagens"}
              </div>
            </div>
          ) : (
            <div className="flex-1 grid gap-1.5" aria-hidden="true">
              <Skeleton height={16} width="55%" />
              <Skeleton height={12} width="35%" />
            </div>
          )}
          {p && <Pill>{classificacao(p.viagens_count)}</Pill>}
        </div>
        {p && (
          <div className="px-4 pt-3 grid gap-3">
            <div className="grid grid-cols-4 gap-2">
              <Numero rotulo="viagens" valor={p.viagens_count ?? 0} />
              <Numero rotulo="passagens" valor={p.total_passagens ?? 0} />
              <Numero rotulo="gerados" valor={fmtBRL(Number(p.total_gasto || 0))} />
              <Numero
                rotulo="cancelou / faltou"
                valor={`${p.cancelamentos ?? 0} / ${p.nao_compareceu ?? 0}`}
              />
            </div>
            {tel && (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`tel:${tel}`}
                  className="btn-press flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-[13px] font-medium"
                  style={{ background: C.panel2, color: C.ink }}
                >
                  <Phone size={15} /> Ligar
                </a>
                <a
                  href={`https://wa.me/55${tel}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-press flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-[13px] font-medium"
                  style={{ background: C.panel2, color: C.ink }}
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 px-2 mt-2" role="tablist" aria-label="Partes da ficha">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className="btn-press min-h-[44px] text-[14px] font-semibold border-b-2"
              style={{
                color: aba === a.id ? C.ink : C.inkFaint,
                borderColor: aba === a.id ? C.brand : "transparent",
              }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </header>
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
        role="tabpanel"
        aria-label={ABAS.find((a) => a.id === aba)?.rotulo}
      >
        {erro && (
          <ErrorBanner onRetry={tentarDeNovo} className="mb-3">
            {erro}
          </ErrorBanner>
        )}
        {carregando ? (
          <div className="space-y-2" data-testid="ficha-carregando">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={44} rounded={8} />
            ))}
          </div>
        ) : !p ? (
          <p className="text-sm" style={{ color: C.inkSoft }}>
            Este passageiro não está mais no cadastro.
          </p>
        ) : (
          <FadeIn key={aba}>
            {aba === "viagens" && (
              <HistoricoDeViagens viagens={viagens} loading={carregandoViagens} trips={trips} />
            )}
            {aba === "enderecos" && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <EnderecosFreq
                    titulo="Embarque (ida)"
                    itens={enderecosIda}
                    loading={carregandoViagens}
                  />
                  <EnderecosFreq
                    titulo="Desembarque (volta)"
                    itens={enderecosVolta}
                    loading={carregandoViagens}
                  />
                </div>
                <EnderecoDeCostume p={p} trips={trips} onAgendar={onAgendar} />
              </div>
            )}
            {aba === "cadastro" && (
              <Cadastro
                p={p}
                trips={trips}
                onSalvarNota={nota}
                onSalvarPerfil={perfil}
                onRemover={removerEFechar}
              />
            )}
          </FadeIn>
        )}
      </div>
    </>
  );
}

/**
 * `ficha` = { customerId, inicial?, aba? } do último passageiro aberto; `aberta` liga e desliga
 * (a ficha some com transição). `onAlterado(id, campos)` e `onRemovido(id)` avisam a lista.
 */
export default function FichaDoPassageiro({
  ficha,
  aberta,
  onFechar,
  trips,
  onAgendar,
  onAlterado,
  onRemovido,
}) {
  const fecharNoEsc = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onFechar();
  };

  return (
    <Presence when={aberta && !!ficha} {...ENTRADA}>
      {(_estado, estilo) =>
        createPortal(
          <div
            className="fixed inset-0 z-50 md:flex md:items-center md:justify-center"
            style={{
              background: "rgba(0,0,0,.6)",
              opacity: estilo?.opacity,
              transition: estilo?.transition,
            }}
            onClick={onFechar}
            onKeyDown={fecharNoEsc}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Ficha do passageiro${ficha?.inicial?.nome ? ` ${ficha.inicial.nome}` : ""}`}
              className="absolute inset-0 md:static md:w-[640px] md:max-w-[calc(100vw-48px)] md:h-[min(88vh,860px)] md:rounded-2xl md:border flex flex-col overflow-hidden"
              style={{ background: C.bg, borderColor: C.border, ...estilo }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={fecharNoEsc}
            >
              <Conteudo
                key={ficha.customerId}
                customerId={ficha.customerId}
                inicial={ficha.inicial ?? null}
                abaInicial={ficha.aba ?? "viagens"}
                trips={trips}
                onFechar={onFechar}
                // agendar pela ficha fecha a ficha: a nova reserva abre por cima da tela
                onAgendar={
                  onAgendar
                    ? (inicial) => {
                        onFechar();
                        onAgendar(inicial);
                      }
                    : null
                }
                onAlterado={onAlterado}
                onRemovido={onRemovido}
              />
            </div>
          </div>,
          document.body,
        )
      }
    </Presence>
  );
}
