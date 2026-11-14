// src/app/tabs/VencimentosTab.jsx
//
// Vencimentos (issues #366 e #369), aba do grupo Gestão: estimativa do DAS do
// Simples Nacional e o calendário de contas e documentos (imposto, IPVA,
// licenciamento, vistoria, seguro, parcelas). O sino avisa sozinho dentro do
// prazo; quitar uma conta que se repete já agenda a próxima.

import { CalendarClock, Check, Plus, Receipt, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { todayStr } from "../../domain/format.js";
import { ANEXOS } from "../../domain/simplesNacional.js";
import {
  CATEGORIAS_DE_VENCIMENTO,
  RECORRENCIAS,
  ordenarVencimentos,
  situacaoDoVencimento,
  textoDaSituacao,
  vencimentoDoForm,
} from "../../domain/vencimentos.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useVehicles } from "../../hooks/useVehicles.js";
import { useVencimentos } from "../../hooks/useVencimentos.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
import {
  C,
  Card,
  ErrorBanner,
  Field,
  Header,
  Select,
  TextInput,
  fmtBRL,
  fmtDate,
} from "../tabShared.jsx";

const COR = {
  vencido: { cor: "#fff", fundo: C.red },
  prazo: { cor: C.onBrand, fundo: C.amber },
  ok: { cor: C.inkSoft, fundo: C.panel },
  quitado: { cor: C.inkFaint, fundo: C.panel },
};

const FORM_VAZIO = {
  titulo: "",
  categoria: "veiculo",
  vehicleId: "",
  venceEm: "",
  valor: "",
  recorrencia: "anual",
  avisarDias: 30,
  notas: "",
};

const pct = (n) => `${(n * 100).toFixed(2).replace(".", ",")}%`;
const mesAno = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function CardDoDas({ das, simples, onSalvarSimples, salvando }) {
  const [editando, setEditando] = useState(false);
  const [anexo, setAnexo] = useState(simples.anexo);
  const [aliq, setAliq] = useState(simples.aliquotaManual ?? "");
  if (!das) {
    return (
      <Card>
        <div className="text-sm" style={{ color: C.inkSoft }}>
          A receita dos últimos 12 meses passou do teto do Simples Nacional: confira com o contador.
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Receipt size={16} style={{ color: C.inkSoft }} /> DAS do Simples Nacional — estimativa
          </div>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Apuração {mesAno(das.mes)}
            {das.vencimento ? ` · vence ${fmtDate(das.vencimento.vence_em)}` : ""}
          </div>
        </div>
        <div
          className="text-2xl font-bold"
          style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}
          data-testid="valor-do-das"
        >
          {fmtBRL(das.valor)}
        </div>
      </div>
      <div
        className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3 text-xs"
        style={{ color: C.inkSoft }}
      >
        <div>
          Receita de {mesAno(das.mes)}
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            {fmtBRL(das.receitaMes)}
          </div>
        </div>
        <div>
          Receita dos 12 meses anteriores
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            {fmtBRL(das.rbt12)}
          </div>
        </div>
        <div>
          Alíquota {das.manual ? "do contador" : `efetiva (Anexo ${simples.anexo})`}
          <div className="text-sm font-semibold" style={{ color: C.ink }}>
            {pct(das.aliquota)}
          </div>
        </div>
      </div>
      <p className="text-[11px] mt-3" style={{ color: C.inkFaint }}>
        Estimativa pela receita lançada no Financeiro
        {das.mesesSemDado > 0 ? ` (${das.mesesSemDado} dos 12 meses sem lançamento)` : ""}. O valor
        oficial é o do contador; se ele passar a alíquota, informe aqui que a conta passa a usá-la.
      </p>
      {!editando ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="btn-press mt-2 text-xs px-3 min-h-[40px] rounded-lg"
          style={{ background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }}
        >
          Anexo e alíquota do contador
        </button>
      ) : (
        <div className="mt-2 form-linha flex flex-wrap items-end gap-2">
          <Field label="Anexo">
            <Select value={anexo} onChange={(e) => setAnexo(e.target.value)}>
              {ANEXOS.map((a) => (
                <option key={a} value={a}>
                  Anexo {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Alíquota do contador (%)">
            <TextInput
              inputMode="decimal"
              value={aliq}
              placeholder="vazio = calcular"
              onChange={(e) => setAliq(e.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={salvando}
            onClick={async () => {
              const n = String(aliq).trim() ? Number(String(aliq).replace(",", ".")) : null;
              await onSalvarSimples({
                anexo,
                aliquotaManual: Number.isFinite(n) && n > 0 ? n : null,
              });
              setEditando(false);
            }}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md font-semibold mb-1"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <Save size={13} /> Salvar
          </button>
        </div>
      )}
    </Card>
  );
}

export default function VencimentosTab() {
  const cfg = useSettings();
  const venc = useVencimentos(cfg.simples);
  const { vehicles } = useVehicles();
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState("");
  const hoje = todayStr();
  const lista = ordenarVencimentos(venc.vencimentos, hoje);
  const nomeVeiculo = (id) => vehicles?.find((v) => v.id === id)?.name;

  const salvar = async () => {
    const r = vencimentoDoForm(form);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    try {
      await venc.criar(r.dados);
      setForm(null);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
    }
  };
  const acao = (fn, msg) => async () => {
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
    }
  };
  const campo = (nome) => ({
    value: form?.[nome] ?? "",
    onChange: (e) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  });

  return (
    <div>
      <Header
        title="Vencimentos"
        subtitle="Imposto, documentos dos veículos, seguro e parcelas. O sino avisa antes de vencer."
      />
      <div className="px-4 md:px-10 pb-10 space-y-4">
        {(erro || venc.error) && (
          <ErrorBanner
            onDismiss={erro ? () => setErro("") : undefined}
            onRetry={erro ? undefined : venc.recarregar}
          >
            {erro || mensagemAmigavel(venc.error, "Não foi possível carregar os vencimentos.")}
          </ErrorBanner>
        )}

        {venc.loading && venc.vencimentos.length === 0 ? (
          <Skeleton height={150} rounded={12} />
        ) : (
          <CardDoDas
            das={venc.das}
            simples={cfg.simples}
            onSalvarSimples={cfg.setSimples}
            salvando={cfg.saving}
          />
        )}

        <Card>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock size={16} style={{ color: C.inkSoft }} /> Próximos vencimentos
            </div>
            {!form && (
              <button
                type="button"
                onClick={() => setForm({ ...FORM_VAZIO })}
                className="btn-press flex items-center gap-1.5 text-xs px-3 min-h-[40px] rounded-lg font-semibold"
                style={{ background: C.amber, color: C.onBrand }}
              >
                <Plus size={13} /> Novo
              </button>
            )}
          </div>

          <Presence when={!!form} duration={200} {...fadeScale}>
            {form && (
              <div
                className="rounded-xl p-3 mb-3 space-y-2"
                style={{ background: C.panel2, border: `1px solid ${C.border}` }}
                data-testid="novo-vencimento"
              >
                <Field label="O que vence">
                  <TextInput placeholder="Ex.: IPVA do ônibus" {...campo("titulo")} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tipo">
                    <Select {...campo("categoria")}>
                      {CATEGORIAS_DE_VENCIMENTO.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Veículo (opcional)">
                    <Select {...campo("vehicleId")}>
                      <option value="">—</option>
                      {(vehicles ?? []).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Vence em">
                    <TextInput type="date" {...campo("venceEm")} />
                  </Field>
                  <Field label="Valor (R$, opcional)">
                    <TextInput inputMode="decimal" {...campo("valor")} />
                  </Field>
                  <Field label="Repete">
                    <Select {...campo("recorrencia")}>
                      {RECORRENCIAS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Avisar quantos dias antes">
                    <TextInput
                      inputMode="numeric"
                      value={form.avisarDias}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, avisarDias: Number(e.target.value) || 0 }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={salvar}
                    disabled={venc.salvando}
                    className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background: C.amber, color: C.onBrand }}
                  >
                    <Save size={13} /> Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                    style={{ background: C.panel, color: C.inkSoft }}
                  >
                    <X size={13} /> Cancelar
                  </button>
                </div>
              </div>
            )}
          </Presence>

          {venc.loading && venc.vencimentos.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} rounded={10} />
              ))}
            </div>
          )}
          {!venc.loading && lista.length === 0 && (
            <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
              Nenhum vencimento cadastrado.
            </div>
          )}
          <div className="space-y-2" data-testid="lista-de-vencimentos">
            {lista.map((v) => {
              const s = situacaoDoVencimento(v, hoje);
              const cor = COR[s.tipo];
              return (
                <FadeIn key={v.id}>
                  <div
                    className="rounded-lg p-3 flex items-start justify-between gap-3"
                    style={{
                      background: C.panel2,
                      opacity: s.tipo === "quitado" ? 0.6 : 1,
                      border: `1px solid ${s.tipo === "vencido" ? C.red : "transparent"}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
                        {v.titulo}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
                        {fmtDate(v.vence_em)}
                        {v.valor != null ? ` · ${fmtBRL(Number(v.valor))}` : ""}
                        {v.vehicle_id && nomeVeiculo(v.vehicle_id)
                          ? ` · ${nomeVeiculo(v.vehicle_id)}`
                          : ""}
                        {v.recorrencia !== "nenhuma"
                          ? ` · ${RECORRENCIAS.find((r) => r.id === v.recorrencia)?.label.toLowerCase()}`
                          : ""}
                      </div>
                      <span
                        className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-1"
                        style={{ background: cor.fundo, color: cor.cor }}
                      >
                        {textoDaSituacao(s)}
                      </span>
                    </div>
                    {s.tipo !== "quitado" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={acao(() => venc.quitar(v.id), "Não foi possível quitar.")}
                          aria-label={`Quitar ${v.titulo}`}
                          className="btn-press flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md font-semibold"
                          style={{
                            background: C.panel,
                            color: C.ink,
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          <Check size={13} /> Quitar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remover "${v.titulo}" dos vencimentos?`)) {
                              acao(() => venc.remover(v.id), "Não foi possível remover.")();
                            }
                          }}
                          aria-label={`Remover ${v.titulo}`}
                          className="btn-press p-1.5 rounded-md"
                          style={{ color: C.inkFaint }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
