import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Tag,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { validarValor } from "../../domain/validacao.js";
import { useFinanceMonth } from "../../hooks/useFinance.js";
import { useRecurringExpenses } from "../../hooks/useRecurringExpenses.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  C,
  Card,
  Header,
  MESES_PT,
  Pill,
  Select,
  StatCard,
  SubTabs,
  TextInput,
  clampDia,
  fmtBRL,
  fmtDate,
  mapEntry,
  somaTipo,
  useCategorias,
  useDeepLinkSubview,
} from "../tabShared.jsx";

/* ===================== 5c. GESTÃO OPERACIONAL ============================= */
// Visão empresarial: DRE do mês com TODOS os custos (caixa + recorrentes)
// e o resultado líquido. Custos fixos/recorrentes são lançados sozinhos
// pelo banco (fn_generate_recurring_expenses / cron) e continuam 100%
// editáveis. Ver database/19-gestao-operacional.sql.

function quandoLanca(t) {
  if (t.frequency === "anual")
    return `todo dia ${t.due_day} de ${MESES_PT[(t.due_month || 1) - 1]}`;
  return `todo dia ${t.due_day}`;
}

function LinhaDRE({ label, valor, negativo = false, forte = false, indent = false }) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderTop: forte ? `1px solid ${C.border}` : "none", marginTop: forte ? 4 : 0 }}
    >
      <span
        className={indent ? "pl-3" : ""}
        style={{
          color: forte ? C.ink : C.inkSoft,
          fontWeight: forte ? 600 : 400,
          fontSize: forte ? "0.9rem" : "0.83rem",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: forte ? 700 : 500,
          color: forte ? (valor >= 0 ? C.green : C.red) : negativo && valor > 0 ? C.red : C.ink,
        }}
      >
        {negativo && valor > 0 ? "− " : ""}
        {fmtBRL(valor)}
      </span>
    </div>
  );
}

export default function GestaoTab({ deepLink }) {
  const [mesRef, setMesRef] = useState(new Date());
  const ano = mesRef.getFullYear();
  const mes = mesRef.getMonth();
  const fin = useFinanceMonth(ano, mes + 1);
  const rec = useRecurringExpenses();
  const cats = useCategorias();

  const [aba, setAba] = useState("resultado");
  useDeepLinkSubview(deepLink, setAba);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const entries = useMemo(() => (fin.entries || []).map(mapEntry), [fin.entries]);
  const receita = useMemo(() => somaTipo(entries, "receita"), [entries]);
  const despesaTotal = useMemo(() => somaTipo(entries, "despesa"), [entries]);
  const resultado = receita - despesaTotal;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;

  const porCategoria = useMemo(() => {
    const m = {};
    for (const e of entries) {
      if (e.tipo !== "despesa") continue;
      const k = e.categoria || "outro";
      m[k] = (m[k] || 0) + e.valor;
    }
    return m;
  }, [entries]);

  const totalPorGrupo = useMemo(() => {
    const g = Object.fromEntries(cats.gruposGestao.map((x) => [x, 0]));
    for (const c of cats.gestao) g[c.grupo] = (g[c.grupo] || 0) + (porCategoria[c.slug] || 0);
    return g;
  }, [porCategoria, cats.gestao, cats.gruposGestao]);
  const totalGestao = cats.gruposGestao.reduce((s, g) => s + (totalPorGrupo[g] || 0), 0);
  const custoOperacao = despesaTotal - totalGestao;

  const run = async (fn, msgErro) => {
    setErro("");
    setAviso("");
    try {
      return await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msgErro || "Não foi possível concluir."));
    }
  };

  const gerarAgora = () =>
    run(async () => {
      const r = await rec.gerarAgora();
      setAviso(
        r?.gerados > 0
          ? `${r.gerados} lançamento(s) gerado(s).`
          : "Tudo em dia — nenhum lançamento novo para gerar.",
      );
    }, "Não foi possível gerar os lançamentos.");

  return (
    <div>
      <Header
        title="Gestão Operacional"
        subtitle="Resultado líquido do mês com todos os custos da empresa — recorrentes lançados sozinhos, tudo editável."
        right={
          fin.loading || rec.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />

      {(erro || fin.error || rec.error) && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />{" "}
            {erro || "Erro ao carregar dados (só admin/financeiro têm acesso)."}
          </span>
          {erro && (
            <button type="button" onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      {aviso && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.greenSoft, color: C.green }}
        >
          <span className="flex items-center gap-2">
            <Check size={14} /> {aviso}
          </span>
          <button type="button" onClick={() => setAviso("")}>
            <X size={13} />
          </button>
        </div>
      )}

      <div className="px-6 md:px-10 flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMesRef(new Date(ano, mes - 1, 1))}
            className="btn-press p-1 rounded"
            style={{ color: C.inkSoft }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold capitalize min-w-[150px] text-center">
            {MESES_PT[mes]} de {ano}
          </div>
          <button
            type="button"
            onClick={() => setMesRef(new Date(ano, mes + 1, 1))}
            className="btn-press p-1 rounded"
            style={{ color: C.inkSoft }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <SubTabs
          value={aba}
          onChange={setAba}
          options={[
            { id: "resultado", label: "Resultado", Icon: TrendingUp },
            { id: "categorias", label: "Categorias", Icon: Tag },
            { id: "recorrentes", label: "Custos recorrentes", Icon: RefreshCw },
            { id: "lancamentos", label: "Lançamentos do mês", Icon: Receipt },
          ]}
        />
      </div>

      <div className="px-6 md:px-10 pb-10 space-y-6">
        {aba === "resultado" && (
          <GestaoResultado
            receita={receita}
            despesaTotal={despesaTotal}
            resultado={resultado}
            margem={margem}
            custoOperacao={custoOperacao}
            totalPorGrupo={totalPorGrupo}
            porCategoria={porCategoria}
            cats={cats}
          />
        )}
        {aba === "categorias" && <GestaoCategorias cats={cats} run={run} />}
        {aba === "recorrentes" && (
          <GestaoRecorrentes rec={rec} cats={cats} run={run} onGerar={gerarAgora} />
        )}
        {aba === "lancamentos" && (
          <GestaoLancamentos
            entries={entries}
            fin={fin}
            ano={ano}
            mes={mes}
            run={run}
            cats={cats}
          />
        )}
      </div>
    </div>
  );
}

function GestaoResultado({
  receita,
  despesaTotal,
  resultado,
  margem,
  custoOperacao,
  totalPorGrupo,
  porCategoria,
  cats,
}) {
  const [grupoAberto, setGrupoAberto] = useState(null);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Receita do mês" value={fmtBRL(receita)} icon={Wallet} accent={C.green} />
        <StatCard
          label="Despesas do mês"
          value={fmtBRL(despesaTotal)}
          icon={TrendingUp}
          accent={C.red}
        />
        <StatCard
          label="Resultado líquido"
          value={fmtBRL(resultado)}
          icon={Landmark}
          accent={resultado >= 0 ? C.blue : C.red}
        />
        <StatCard
          label="Margem líquida"
          value={`${margem.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
          icon={TrendingUp}
          accent={resultado >= 0 ? C.blue : C.red}
        />
      </div>

      <Card>
        <div className="text-sm font-semibold mb-1">Demonstrativo do mês</div>
        <div className="text-xs mb-2" style={{ color: C.inkFaint }}>
          Tudo que entrou menos tudo que saiu — inclui combustível, manutenção e os custos
          recorrentes da empresa. Clique num grupo pra ver as categorias por trás do valor.
        </div>
        <LinhaDRE label="Receita bruta" valor={receita} forte />
        <LinhaDRE
          label="Custos de operação (combustível, manutenção, diárias…)"
          valor={custoOperacao}
          negativo
          indent
        />
        {cats.gruposGestao.map((g) => {
          const aberto = grupoAberto === g;
          const catsDoGrupo = cats.gestao.filter((c) => c.grupo === g);
          return (
            <div key={g}>
              <button
                type="button"
                onClick={() => setGrupoAberto(aberto ? null : g)}
                className="w-full flex items-center gap-1 text-left"
              >
                {aberto ? (
                  <ChevronDown size={12} style={{ color: C.inkFaint }} />
                ) : (
                  <ChevronRight size={12} style={{ color: C.inkFaint }} />
                )}
                <div className="flex-1">
                  <LinhaDRE label={g} valor={totalPorGrupo[g] || 0} negativo indent />
                </div>
              </button>
              {aberto && (
                <div className="pl-8 pb-1.5 space-y-1">
                  {catsDoGrupo.map((c) => {
                    const v = porCategoria[c.slug] || 0;
                    return (
                      <div
                        key={c.slug}
                        className="flex items-center justify-between text-xs"
                        style={{ color: v > 0 ? C.ink : C.inkFaint }}
                      >
                        <span>{c.label}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmtBRL(v)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <LinhaDRE label="Resultado líquido" valor={resultado} forte />
      </Card>
    </>
  );
}

function GestaoRecorrentes({ rec, cats, run, onGerar }) {
  const catInicial = cats.gestao[0]?.slug ?? "";
  const [form, setForm] = useState({
    category: catInicial,
    label: "",
    amount: "",
    frequency: "mensal",
    dueDay: "5",
    dueMonth: "1",
    notes: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const resetForm = () =>
    setForm({
      category: cats.gestao[0]?.slug ?? "",
      label: "",
      amount: "",
      frequency: "mensal",
      dueDay: "5",
      dueMonth: "1",
      notes: "",
    });

  const add = () =>
    run(async () => {
      if (!form.label.trim() || !form.amount) return;
      await rec.addTemplate({
        category: form.category,
        label: form.label.trim(),
        amount: Number.parseFloat(form.amount),
        frequency: form.frequency,
        dueDay: clampDia(form.dueDay),
        dueMonth: form.frequency === "anual" ? Number.parseInt(form.dueMonth, 10) || 1 : null,
        notes: form.notes.trim() || null,
      });
      resetForm();
    }, "Não foi possível adicionar o custo recorrente.");

  const salvarEdicao = () =>
    run(async () => {
      await rec.updateTemplate(editId, {
        category: editVal.category || cats.gestao[0]?.slug || "",
        label: editVal.label?.trim() || "Custo",
        amount: Number.parseFloat(editVal.amount) || 0,
        frequency: editVal.frequency,
        due_day: clampDia(editVal.due_day),
        due_month:
          editVal.frequency === "anual" ? Number.parseInt(editVal.due_month, 10) || 1 : null,
        notes: (editVal.notes ?? "").trim() || null,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const toggleAtivo = (t) =>
    run(() => rec.updateTemplate(t.id, { active: !t.active }), "Não foi possível alterar.");
  const excluir = (t) => run(() => rec.removeTemplate(t.id), "Não foi possível excluir.");

  // seletor de categoria reutilizado no form de novo custo e na edição —
  // criar categoria nova agora é só na aba "Categorias".
  const categoriaSelect = (value, onChange) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {cats.gruposGestao.map((g) => (
        <optgroup key={g} label={g}>
          {cats.gestao
            .filter((c) => c.grupo === g)
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
        </optgroup>
      ))}
      {!cats.existe(value) && value ? <option value={value}>{value}</option> : null}
    </Select>
  );

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold">Como funciona a automação</div>
          <button
            type="button"
            onClick={onGerar}
            disabled={rec.gerando}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
            style={{ background: C.blueSoft, color: C.blue, fontWeight: 600 }}
          >
            <RefreshCw size={13} /> {rec.gerando ? "Gerando…" : "Gerar lançamentos agora"}
          </button>
        </div>
        <p className="text-xs" style={{ color: C.inkSoft }}>
          Cada custo abaixo é lançado sozinho na competência (todo mês ou todo ano, no dia
          configurado). O lançamento gerado aparece em <b>Financeiro</b> e na aba{" "}
          <b>Lançamentos do mês</b> — e é 100% editável: dá pra mudar o valor, a data ou apagar sem
          mexer no modelo.
        </p>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Novo custo recorrente</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Categoria
            </label>
            {categoriaSelect(form.category, (v) => setForm({ ...form, category: v }))}
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Descrição
            </label>
            <TextInput
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ex.: Salário motorista João"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Valor (R$)
            </label>
            <TextInput
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Frequência
            </label>
            <Select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </Select>
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Dia do mês (1–31)
            </label>
            <TextInput
              type="number"
              min="1"
              max="31"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
            <div className="text-[10px] mt-0.5" style={{ color: C.inkFaint }}>
              Em meses mais curtos, cai no último dia.
            </div>
          </div>
          {form.frequency === "anual" && (
            <div>
              <label className="text-xs" style={{ color: C.inkFaint }}>
                Mês
              </label>
              <Select
                value={form.dueMonth}
                onChange={(e) => setForm({ ...form, dueMonth: e.target.value })}
              >
                {MESES_PT.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Observação (opcional)
            </label>
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ex.: contrato até dez/2027, reajuste anual…"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={add}
              disabled={rec.salvando || !form.label.trim() || !form.amount}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md w-full justify-center"
              style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
            >
              <Plus size={13} /> Adicionar
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Custos recorrentes cadastrados</div>
        {rec.templates.length === 0 ? (
          <div className="text-center py-8 text-xs" style={{ color: C.inkFaint }}>
            Nenhum custo recorrente ainda. Cadastre acima para o sistema começar a lançar sozinho.
          </div>
        ) : (
          <div className="space-y-4">
            {[...new Set(rec.templates.map((t) => cats.grupo(t.category)))].map((g) => {
              const ts = rec.templates.filter((t) => cats.grupo(t.category) === g);
              if (ts.length === 0) return null;
              return (
                <div key={g}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                    {g}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                          <th className="px-3 py-1.5 font-medium">Categoria</th>
                          <th className="px-3 py-1.5 font-medium">Descrição</th>
                          <th className="px-3 py-1.5 font-medium">Valor</th>
                          <th className="px-3 py-1.5 font-medium">Quando</th>
                          <th className="px-3 py-1.5 font-medium">Status</th>
                          <th className="px-3 py-1.5 font-medium" aria-label="ações" />
                        </tr>
                      </thead>
                      <tbody>
                        {ts.map((t) =>
                          editId === t.id ? (
                            <tr key={t.id} style={{ background: C.panel2 }}>
                              <td className="px-3 py-2">
                                {categoriaSelect(editVal.category, (v) =>
                                  setEditVal({ ...editVal, category: v }),
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  value={editVal.label}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, label: e.target.value })
                                  }
                                />
                                <TextInput
                                  value={editVal.notes ?? ""}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, notes: e.target.value })
                                  }
                                  placeholder="observação"
                                  className="mt-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  type="number"
                                  value={editVal.amount}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, amount: e.target.value })
                                  }
                                  className="w-24"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={editVal.frequency}
                                    onChange={(e) =>
                                      setEditVal({ ...editVal, frequency: e.target.value })
                                    }
                                    className="w-24"
                                  >
                                    <option value="mensal">Mensal</option>
                                    <option value="anual">Anual</option>
                                  </Select>
                                  <TextInput
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editVal.due_day}
                                    onChange={(e) =>
                                      setEditVal({ ...editVal, due_day: e.target.value })
                                    }
                                    className="w-14"
                                  />
                                  {editVal.frequency === "anual" && (
                                    <Select
                                      value={editVal.due_month}
                                      onChange={(e) =>
                                        setEditVal({ ...editVal, due_month: e.target.value })
                                      }
                                      className="w-28"
                                    >
                                      {MESES_PT.map((m, i) => (
                                        <option key={m} value={i + 1}>
                                          {m}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button type="button" onClick={salvarEdicao}>
                                    <Save size={13} style={{ color: C.green }} />
                                  </button>
                                  <button type="button" onClick={() => setEditId(null)}>
                                    <X size={13} style={{ color: C.inkFaint }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={t.id}
                              className="row-hover border-t"
                              style={{ borderColor: C.borderSoft, opacity: t.active ? 1 : 0.55 }}
                            >
                              <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                                {cats.rotulo(t.category)}
                              </td>
                              <td className="px-3 py-2">
                                {t.label}
                                {t.notes && (
                                  <div className="text-[11px]" style={{ color: C.inkFaint }}>
                                    {t.notes}
                                  </div>
                                )}
                              </td>
                              <td
                                className="px-3 py-2"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                {fmtBRL(Number(t.amount))}
                              </td>
                              <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                                {quandoLanca(t)}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAtivo(t)}
                                  className="btn-press"
                                >
                                  <Pill
                                    color={t.active ? C.green : C.inkFaint}
                                    bg={t.active ? C.greenSoft : C.graySoft}
                                  >
                                    {t.active ? "Ativo" : "Pausado"}
                                  </Pill>
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditId(t.id);
                                      setEditVal({
                                        category: t.category,
                                        label: t.label,
                                        notes: t.notes ?? "",
                                        amount: String(t.amount),
                                        frequency: t.frequency,
                                        due_day: String(t.due_day),
                                        due_month: String(t.due_month || 1),
                                      });
                                    }}
                                  >
                                    <Pencil size={12} style={{ color: C.inkFaint }} />
                                  </button>
                                  <button type="button" onClick={() => excluir(t)}>
                                    <X size={13} style={{ color: C.inkFaint }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// Cadastro livre das categorias de custo — Gestão (kind="gestao", entra no
// DRE/custos recorrentes) e Caixa do dia (kind="despesa", entra nos botões
// rápidos do Financeiro). Renomear, reagrupar, pausar e remover (se ninguém
// usa) valem pros dois tipos.
function GestaoCategorias({ cats, run }) {
  return (
    <>
      <CategoriaCard
        titulo="Custos empresariais (Gestão)"
        descricao="Entram no Demonstrativo do mês e nos custos recorrentes — ex.: salários, seguro, IPVA."
        kind="gestao"
        lista={cats.gestao}
        grupos={cats.gruposGestao}
        gruposSugeridos={["Pessoal", "Impostos & Taxas", "Veículo", "Estrutura"]}
        cats={cats}
        run={run}
      />
      <CategoriaCard
        titulo="Caixa do dia (Financeiro)"
        descricao="Aparecem como botão rápido na tela de Financeiro — ex.: combustível, diárias, manutenção."
        kind="despesa"
        lista={cats.despesa}
        grupos={cats.gruposDespesa}
        gruposSugeridos={["Caixa do dia"]}
        cats={cats}
        run={run}
      />
    </>
  );
}

function CategoriaCard({ titulo, descricao, kind, lista, grupos, gruposSugeridos, cats, run }) {
  const grupoPadrao = gruposSugeridos[0] || "Estrutura";
  const [nova, setNova] = useState({ label: "", grupo: grupoPadrao });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const criar = () =>
    run(async () => {
      if (!nova.label.trim()) return;
      await cats.criar({
        label: nova.label.trim(),
        grupo: nova.grupo.trim() || grupoPadrao,
        kind,
      });
      setNova({ label: "", grupo: nova.grupo });
    }, "Não foi possível criar a categoria.");

  const salvar = () =>
    run(async () => {
      await cats.editar(editId, {
        label: (editVal.label ?? "").trim() || "Categoria",
        grupo: (editVal.grupo ?? "").trim() || grupoPadrao,
      });
      setEditId(null);
    }, "Não foi possível salvar a categoria.");

  const gruposDisponiveis = [...new Set([...grupos, ...gruposSugeridos])];

  return (
    <Card>
      <div className="text-sm font-semibold mb-1">{titulo}</div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        {descricao} Uma categoria só pode ser removida quando nenhum custo ativo está usando ela.
      </p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Nova categoria
          </label>
          <TextInput
            value={nova.label}
            onChange={(e) => setNova({ ...nova, label: e.target.value })}
            placeholder="Ex.: Aluguel do galpão"
            className="w-52"
          />
        </div>
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Grupo
          </label>
          <Select
            value={nova.grupo}
            onChange={(e) => setNova({ ...nova, grupo: e.target.value })}
            className="w-44"
          >
            {gruposDisponiveis.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={criar}
          disabled={!nova.label.trim() || cats.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Criar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
              <th className="px-3 py-1.5 font-medium">Categoria</th>
              <th className="px-3 py-1.5 font-medium">Grupo</th>
              <th className="px-3 py-1.5 font-medium" aria-label="ações" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-6 text-xs" style={{ color: C.inkFaint }}>
                  Nenhuma categoria ainda — crie a primeira acima.
                </td>
              </tr>
            )}
            {lista.map((c) =>
              editId === c.id ? (
                <tr key={c.slug} style={{ background: C.panel2 }}>
                  <td className="px-3 py-2">
                    <TextInput
                      value={editVal.label}
                      onChange={(e) => setEditVal({ ...editVal, label: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={editVal.grupo}
                      onChange={(e) => setEditVal({ ...editVal, grupo: e.target.value })}
                    >
                      {gruposDisponiveis.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={salvar}>
                        <Save size={13} style={{ color: C.green }} />
                      </button>
                      <button type="button" onClick={() => setEditId(null)}>
                        <X size={13} style={{ color: C.inkFaint }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={c.slug}
                  className="row-hover border-t"
                  style={{ borderColor: C.borderSoft }}
                >
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                    {c.grupo}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(c.id);
                          setEditVal({ label: c.label, grupo: c.grupo });
                        }}
                      >
                        <Pencil size={12} style={{ color: C.inkFaint }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => cats.remover(c.id), "Não foi possível remover.")}
                      >
                        <X size={13} style={{ color: C.inkFaint }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GestaoLancamentos({ entries, fin, ano, mes, run, cats }) {
  const [novo, setNovo] = useState({
    category: cats.gestao[0]?.slug ?? "",
    dia: "",
    valor: "",
    descricao: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const doMes = entries.filter((e) => e.tipo === "despesa" && cats.slugsGestao.has(e.categoria));
  const totalMes = doMes.reduce((s, e) => s + e.valor, 0);
  const ordenados = [...doMes].sort((a, b) => a.data.localeCompare(b.data));

  const hoje = new Date();
  const diaPadrao =
    hoje.getFullYear() === ano && hoje.getMonth() === mes ? String(hoje.getDate()) : "1";
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dataDoDia = (d) => {
    const n = Math.min(Math.max(Number.parseInt(d || diaPadrao, 10) || 1, 1), ultimoDia);
    return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  };

  const add = () =>
    run(async () => {
      const v = validarValor(novo.valor, { min: 0.01 });
      if (!v.ok) throw new Error(v.erro);
      await fin.addEntry({
        entryDate: dataDoDia(novo.dia),
        type: "despesa",
        category: novo.category,
        amount: v.valor,
        description: novo.descricao || null,
      });
      setNovo({ category: novo.category, dia: "", valor: "", descricao: "" });
    }, "Não foi possível lançar.");

  const salvar = () =>
    run(async () => {
      await fin.updateEntry(editId, {
        category: editVal.categoria,
        amount: Number.parseFloat(editVal.valor) || 0,
        description: editVal.descricao || null,
      });
      setEditId(null);
    }, "Não foi possível salvar.");
  const remover = (id) => run(() => fin.removeEntry(id), "Não foi possível remover.");

  return (
    <>
      <Card>
        <div className="text-sm font-semibold mb-3">Lançar custo do mês</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <Select
            value={novo.category}
            onChange={(e) => setNovo({ ...novo, category: e.target.value })}
          >
            {cats.gruposGestao.map((g) => (
              <optgroup key={g} label={g}>
                {cats.gestao
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <TextInput
            type="number"
            min="1"
            max="31"
            placeholder={`Dia (${diaPadrao})`}
            value={novo.dia}
            onChange={(e) => setNovo({ ...novo, dia: e.target.value })}
          />
          <TextInput
            type="number"
            placeholder="Valor"
            value={novo.valor}
            onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
          />
          <TextInput
            placeholder="Descrição (opcional)"
            value={novo.descricao}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <button
            type="button"
            onClick={add}
            disabled={!novo.valor}
            className="btn-press flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md"
            style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
          >
            <Plus size={13} /> Lançar
          </button>
        </div>
        <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
          Para custos que se repetem todo mês/ano, use a aba <b>Custos recorrentes</b> — o sistema
          lança sozinho.
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Custos empresariais lançados no mês</div>
          <div
            className="text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: C.inkSoft }}
          >
            {fmtBRL(totalMes)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                <th className="px-3 py-1.5 font-medium">Data</th>
                <th className="px-3 py-1.5 font-medium">Categoria</th>
                <th className="px-3 py-1.5 font-medium">Descrição</th>
                <th className="px-3 py-1.5 font-medium">Valor</th>
                <th className="px-3 py-1.5 font-medium">Origem</th>
                <th className="px-3 py-1.5 font-medium" aria-label="ações" />
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e) =>
                editId === e.id ? (
                  <tr key={e.id} style={{ background: C.panel2 }}>
                    <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                      {fmtDate(e.data)}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={editVal.categoria}
                        onChange={(ev) => setEditVal({ ...editVal, categoria: ev.target.value })}
                      >
                        {cats.gestao.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.label}
                          </option>
                        ))}
                        {!cats.slugsGestao.has(editVal.categoria) && editVal.categoria ? (
                          <option value={editVal.categoria}>{editVal.categoria}</option>
                        ) : null}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={editVal.descricao}
                        onChange={(ev) => setEditVal({ ...editVal, descricao: ev.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        value={editVal.valor}
                        onChange={(ev) => setEditVal({ ...editVal, valor: ev.target.value })}
                        className="w-24"
                      />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={salvar}>
                          <Save size={13} style={{ color: C.green }} />
                        </button>
                        <button type="button" onClick={() => setEditId(null)}>
                          <X size={13} style={{ color: C.inkFaint }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={e.id}
                    className="row-hover border-t"
                    style={{ borderColor: C.borderSoft }}
                  >
                    <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                      {fmtDate(e.data)}
                    </td>
                    <td className="px-3 py-2 text-xs">{cats.rotulo(e.categoria)}</td>
                    <td className="px-3 py-2" style={{ color: C.inkSoft }}>
                      {e.descricao || "—"}
                    </td>
                    <td className="px-3 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtBRL(e.valor)}
                    </td>
                    <td className="px-3 py-2">
                      {e.deTemplate ? (
                        <span className="text-[10px]" style={{ color: C.blue }}>
                          automático
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: C.inkFaint }}>
                          manual
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(e.id);
                            setEditVal({
                              categoria: e.categoria,
                              valor: String(e.valor),
                              descricao: e.descricao,
                            });
                          }}
                        >
                          <Pencil size={12} style={{ color: C.inkFaint }} />
                        </button>
                        <button type="button" onClick={() => remover(e.id)}>
                          <X size={13} style={{ color: C.inkFaint }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {ordenados.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-xs"
                    style={{ color: C.inkFaint }}
                  >
                    Nenhum custo empresarial lançado neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
