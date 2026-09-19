import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Fuel,
  Landmark,
  MessageCircle,
  Pencil,
  Plus,
  Receipt,
  Route,
  Save,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { montarRelatorioFinanceiro } from "../../domain/relatorioFinanceiro.js";
import { validarData, validarValor } from "../../domain/validacao.js";
import { useContasReceber, useFinanceMonth, useFinanceYear } from "../../hooks/useFinance.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  abrirRelatorioFinanceiroPDF,
  baixarRelatorioFinanceiroXLSX,
} from "../../lib/relatorioFinanceiroExport.js";
import { EVENTS, emit } from "../../observability/index.js";
import { FadeIn, Presence, Skeleton } from "../../ui/motion/index.js";
import {
  C,
  CATEGORIAS_RECEITA,
  Card,
  Header,
  HeroFX,
  MESES_PT,
  PIX_KEY,
  Pill,
  Select,
  StatCard,
  SubTabs,
  TextInput,
  digitos,
  fmtBRL,
  fmtDate,
  iconeCategoria,
  mapEntry,
  somaTipo,
  todayStr,
  useCategorias,
  useDeepLinkSubview,
} from "../tabShared.jsx";

export default function FinanceiroTab({ pix, deepLink }) {
  const [subview, setSubview] = useState("lancamentos");
  useDeepLinkSubview(deepLink, setSubview);
  const [mesRef, setMesRef] = useState(new Date());
  const [diaSel, setDiaSel] = useState(todayStr());
  const [novo, setNovo] = useState({
    tipo: "receita",
    categoria: "passagem",
    valor: "",
    descricao: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ano = mesRef.getFullYear();
  const mes = mesRef.getMonth();

  const fin = useFinanceMonth(ano, mes + 1);
  const cats = useCategorias();
  const financeiro = useMemo(() => (fin.entries || []).map(mapEntry), [fin.entries]);
  const receitaMes = somaTipo(financeiro, "receita");
  const despesaMes = somaTipo(financeiro, "despesa");
  const resultadoMes = receitaMes - despesaMes;

  const run = async (fn) => {
    setErro("");
    setSalvando(true);
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };
  const add = () => {
    const v = validarValor(novo.valor, { min: 0.01 });
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    const d = validarData(diaSel);
    if (!d.ok) {
      setErro(d.erro);
      return;
    }
    run(async () => {
      await fin.addEntry({
        entryDate: diaSel,
        type: novo.tipo,
        category: novo.categoria || (novo.tipo === "despesa" ? "outro" : "passagem"),
        amount: v.valor,
        description: novo.descricao || null,
      });
      setNovo({ tipo: "receita", categoria: "passagem", valor: "", descricao: "" });
    });
  };
  const remove = (id) => run(() => fin.removeEntry(id));
  const iniciarEdicao = (f) => {
    setEditId(f.id);
    setEditVal({ ...f });
  };
  const salvarEdicao = () =>
    run(async () => {
      const campos = {
        type: editVal.tipo,
        amount: Number.parseFloat(editVal.valor),
        description: editVal.descricao || null,
      };
      // categoria só faz sentido pra despesa; receita mantém o que já tinha
      if (editVal.tipo === "despesa") campos.category = editVal.categoria || "outro";
      await fin.updateEntry(editId, campos);
      setEditId(null);
    });
  const primeiroDia = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const offset = primeiroDia.getDay();
  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  const lucroPorDia = useCallback(
    (diaNum) => {
      const ds = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(diaNum).padStart(2, "0")}`;
      const receitas = financeiro
        .filter((f) => f.data === ds && f.tipo === "receita")
        .reduce((s, f) => s + f.valor, 0);
      const despesas = financeiro
        .filter((f) => f.data === ds && f.tipo === "despesa")
        .reduce((s, f) => s + f.valor, 0);
      return { ds, lucro: receitas - despesas, temMovimento: receitas > 0 || despesas > 0 };
    },
    [financeiro, ano, mes],
  );
  const doDia = financeiro.filter((f) => f.data === diaSel);
  const receitaDia = doDia.filter((f) => f.tipo === "receita").reduce((s, f) => s + f.valor, 0);
  const despesaDia = doDia.filter((f) => f.tipo === "despesa").reduce((s, f) => s + f.valor, 0);
  // combustível e manutenção já entram como 'despesa' via trigger do banco —
  // então despesaDia já é o total real; "lucro real" = receita − despesa.
  const despesaAutoDia = doDia
    .filter((f) => f.tipo === "despesa" && f.auto)
    .reduce((s, f) => s + f.valor, 0);
  const lucroReal = receitaDia - despesaDia;
  return (
    <div>
      <Header
        title="Financeiro"
        subtitle="Faturamento, despesas e lucro real do dia — combustível e manutenção entram automaticamente."
        right={
          fin.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />
      {(erro || fin.error) && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />{" "}
            {erro || "Erro ao carregar lançamentos (só admin/financeiro têm acesso)."}
          </span>
          {erro && (
            <button onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <div className="px-6 md:px-10 mb-4">
        <SubTabs
          value={subview}
          onChange={setSubview}
          options={[
            { id: "lancamentos", label: "Lançamentos", Icon: Wallet },
            { id: "contas_receber", label: "Contas a receber", Icon: MessageCircle },
            { id: "relatorio", label: "Relatório", Icon: Receipt },
          ]}
        />
      </div>
      {subview === "contas_receber" && <ContasReceberView pix={pix} />}
      {subview === "relatorio" && <RelatorioFinanceiroView />}
      {subview === "lancamentos" && (
        <div className="px-6 md:px-10 pb-10 space-y-5">
          <div
            className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: C.brandDim }}
          >
            <HeroFX />
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMesRef(new Date(ano, mes - 1, 1))}
                className="btn-press p-1.5 rounded-lg"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronLeft size={16} />
              </button>
              <div
                className="capitalize text-center min-w-[130px]"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.15rem",
                  color: "#fff",
                }}
              >
                {MESES_PT[mes]} <span style={{ fontWeight: 400, opacity: 0.7 }}>{ano}</span>
              </div>
              <button
                type="button"
                onClick={() => setMesRef(new Date(ano, mes + 1, 1))}
                className="btn-press p-1.5 rounded-lg"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="relative flex flex-wrap gap-5">
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Receitas
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  {fmtBRL(receitaMes)}
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Despesas
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,.72)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  {fmtBRL(despesaMes)}
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Resultado do mês
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 800,
                    fontSize: "1.1rem",
                  }}
                >
                  {fmtBRL(resultadoMes)}
                </div>
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-[340px_1fr] gap-6">
            <Card className="anim-fadeUp">
              {/* Colunas com largura FIXA (não 1fr) — Safari/iOS tem um bug
                  conhecido de `aspect-ratio` dentro de grid com colunas
                  fluidas: em vez de manter a célula quadrada, ele deixa a
                  linha gigante/desproporcional (relatado pelo dono no
                  celular; não reproduz no Chromium, mas o fix não usa mais
                  aspect-ratio em grid nenhum, então o bug não tem como
                  acontecer independente da causa exata). */}
              <div
                className="grid gap-1 text-center text-[10px] mb-1 justify-center"
                style={{ color: C.inkFaint, gridTemplateColumns: "repeat(7, 34px)" }}
              >
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <div key={i}>{d}</div>
                ))}
              </div>
              <div
                className="grid gap-1 justify-center"
                style={{ gridTemplateColumns: "repeat(7, 34px)" }}
              >
                {cells.map((d, i) => {
                  if (!d) return <div key={i} style={{ width: 34, height: 34 }} />;
                  const { ds, lucro, temMovimento } = lucroPorDia(d);
                  const sel = ds === diaSel;
                  return (
                    <button
                      key={i}
                      onClick={() => setDiaSel(ds)}
                      className="btn-press rounded-lg flex flex-col items-center justify-center text-xs"
                      style={{
                        width: 34,
                        height: 34,
                        background: sel ? C.amber : C.panel2,
                        color: sel ? C.onBrand : C.ink,
                        border:
                          ds === todayStr() && !sel
                            ? `1px solid ${C.amber}`
                            : "1px solid transparent",
                      }}
                    >
                      {d}
                      {temMovimento && (
                        <span
                          className="w-1 h-1 rounded-full mt-0.5"
                          style={{ background: sel ? C.onBrand : lucro >= 0 ? C.green : C.red }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
            <div className="space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard
                  label={`Faturamento ${fmtDate(diaSel)}`}
                  value={fmtBRL(receitaDia)}
                  icon={Wallet}
                  accent={C.green}
                />
                <StatCard
                  label="Despesas (total)"
                  value={fmtBRL(despesaDia)}
                  icon={TrendingUp}
                  accent={C.red}
                />
                <StatCard
                  label="Combustível + manut."
                  value={fmtBRL(despesaAutoDia)}
                  icon={Fuel}
                  accent={C.warn}
                />
                <StatCard
                  label="Lucro do dia"
                  value={fmtBRL(lucroReal)}
                  icon={Route}
                  accent={lucroReal >= 0 ? C.blue : C.red}
                />
              </div>
              <Card>
                <div className="text-sm font-semibold mb-3">Lançar em {fmtDate(diaSel)}</div>
                <div className="text-xs mb-1.5" style={{ color: C.inkFaint }}>
                  Despesa rápida — escolhe a categoria e só falta o valor
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {cats.despesa.map((c) => {
                    const Icon = iconeCategoria(c.icon);
                    const ativo = novo.tipo === "despesa" && novo.categoria === c.slug;
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => {
                          setNovo((n) => ({ ...n, tipo: "despesa", categoria: c.slug }));
                          document.getElementById("financeiro-valor-input")?.focus();
                        }}
                        className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
                        style={{
                          background: ativo ? C.amberSoft : C.panel2,
                          color: ativo ? C.amber : C.inkSoft,
                          fontWeight: ativo ? 600 : 500,
                          border: `1px solid ${ativo ? C.amber : C.border}`,
                        }}
                      >
                        <Icon size={13} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <Select
                    value={novo.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value;
                      setNovo((n) => ({
                        ...n,
                        tipo,
                        categoria:
                          tipo === "receita" ? "passagem" : (cats.despesa[0]?.slug ?? "outro"),
                      }));
                    }}
                  >
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </Select>
                  {novo.tipo === "despesa" ? (
                    <Select
                      value={novo.categoria}
                      onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
                    >
                      {cats.despesa.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label}
                        </option>
                      ))}
                      {!cats.existe(novo.categoria) && novo.categoria ? (
                        <option value={novo.categoria}>{novo.categoria}</option>
                      ) : null}
                    </Select>
                  ) : (
                    <Select
                      value={novo.categoria}
                      onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
                    >
                      {CATEGORIAS_RECEITA.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                  <TextInput
                    id="financeiro-valor-input"
                    placeholder="Valor"
                    type="number"
                    value={novo.valor}
                    onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
                <div className="mt-2">
                  <TextInput
                    placeholder="Descrição"
                    className="w-full"
                    value={novo.descricao}
                    onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
                <button
                  onClick={add}
                  disabled={salvando || !novo.valor}
                  className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: salvando || !novo.valor ? C.border : C.amber,
                    color: salvando || !novo.valor ? C.inkFaint : C.onBrand,
                  }}
                >
                  <Plus size={14} /> {salvando ? "Salvando…" : "Lançar"}
                </button>
              </Card>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: C.panel2, color: C.inkSoft }}>
                      <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                      <th className="text-left px-4 py-2.5 font-medium">Categoria</th>
                      <th className="text-left px-4 py-2.5 font-medium">Valor</th>
                      <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...doDia].reverse().map((f) =>
                      editId === f.id ? (
                        <tr
                          key={f.id}
                          className="border-t anim-slideDown"
                          style={{ borderColor: C.borderSoft, background: C.panel2 }}
                        >
                          <td className="px-2 py-2">
                            <Select
                              value={editVal.tipo}
                              onChange={(e) => setEditVal({ ...editVal, tipo: e.target.value })}
                              className="text-xs py-1"
                            >
                              <option value="receita">Receita</option>
                              <option value="despesa">Despesa</option>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            {editVal.tipo === "despesa" ? (
                              <Select
                                value={editVal.categoria || "outro"}
                                onChange={(e) =>
                                  setEditVal({ ...editVal, categoria: e.target.value })
                                }
                                className="text-xs py-1"
                              >
                                {cats.despesa.map((c) => (
                                  <option key={c.slug} value={c.slug}>
                                    {c.label}
                                  </option>
                                ))}
                                {editVal.categoria && !cats.existe(editVal.categoria) ? (
                                  <option value={editVal.categoria}>
                                    {cats.rotulo(editVal.categoria)}
                                  </option>
                                ) : null}
                              </Select>
                            ) : (
                              <span className="text-xs" style={{ color: C.inkFaint }}>
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <TextInput
                              type="number"
                              value={editVal.valor}
                              onChange={(e) => setEditVal({ ...editVal, valor: e.target.value })}
                              className="text-xs py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <TextInput
                              value={editVal.descricao}
                              onChange={(e) =>
                                setEditVal({ ...editVal, descricao: e.target.value })
                              }
                              className="text-xs py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={salvarEdicao}>
                              <Save size={13} style={{ color: C.green }} />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          key={f.id}
                          className="row-hover border-t"
                          style={{ borderColor: C.borderSoft }}
                        >
                          <td className="px-4 py-2">
                            <Pill
                              color={f.tipo === "receita" ? C.green : C.red}
                              bg={f.tipo === "receita" ? C.greenSoft : C.redSoft}
                            >
                              {f.tipo}
                            </Pill>
                          </td>
                          <td className="px-4 py-2 text-xs" style={{ color: C.inkSoft }}>
                            {f.tipo === "despesa" ? cats.rotulo(f.categoria) : "—"}
                          </td>
                          <td
                            className="px-4 py-2"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {fmtBRL(f.valor)}
                          </td>
                          <td className="px-4 py-2" style={{ color: C.inkSoft }}>
                            {f.descricao}
                            {f.auto ? (
                              <span className="ml-1.5 text-[10px]" style={{ color: C.inkFaint }}>
                                · automático
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {f.auto ? (
                              <span className="text-[10px]" style={{ color: C.inkFaint }}>
                                da operação
                              </span>
                            ) : (
                              <div className="flex gap-2">
                                <button onClick={() => iniciarEdicao(f)}>
                                  <Pencil size={12} style={{ color: C.inkFaint }} />
                                </button>
                                <button onClick={() => remove(f.id)}>
                                  <X size={13} style={{ color: C.inkFaint }} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                    {doDia.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-8 text-xs"
                          style={{ color: C.inkFaint }}
                        >
                          Nenhum lançamento neste dia.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Relatório financeiro por período (issue #12): faturamento e lucro
   por dia / mês / ano, a partir dos mesmos financial_entries do calendário.
   Exporta em PDF (janela de impressão) ou XLSX (exceljs). A agregação é
   pura — domain/relatorioFinanceiro.js; aqui é só tela + download. --- */
const GRANULARIDADES_RELATORIO = [
  { id: "mes", label: "Por mês" },
  { id: "dia", label: "Por dia" },
  { id: "ano", label: "Por ano" },
];

function rotuloPeriodoRelatorio(periodo, gran) {
  const p = String(periodo).split("-");
  if (gran === "ano") return p[0];
  if (gran === "mes") return `${MESES_PT[Number(p[1]) - 1] ?? p[1]}/${p[0]}`;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function RelatorioFinanceiroView() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [gran, setGran] = useState("mes");
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState(false);
  const finAno = useFinanceYear(ano);

  const relatorio = useMemo(
    () =>
      montarRelatorioFinanceiro(finAno.entries || [], {
        granularidade: gran,
        escopo: String(ano),
      }),
    [finAno.entries, gran, ano],
  );

  const exportar = async (formato) => {
    setErro("");
    try {
      emit(EVENTS.RELATORIO_FINANCEIRO_EXPORTADO, {
        formato,
        granularidade: gran,
        ano,
        linhas: relatorio.linhas.length,
      });
      if (formato === "pdf") {
        abrirRelatorioFinanceiroPDF(relatorio);
      } else {
        setBaixando(true);
        await baixarRelatorioFinanceiroXLSX(relatorio);
      }
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível gerar o relatório."));
    } finally {
      setBaixando(false);
    }
  };

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const semDados = !finAno.loading && relatorio.linhas.length === 0;

  return (
    <div className="px-6 md:px-10 pb-10 space-y-5">
      <Presence when={!!(erro || finAno.error)}>
        <div
          className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {erro || "Erro ao carregar os lançamentos do ano."}
          </span>
          {erro && (
            <button type="button" onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      </Presence>

      <Card className="anim-fadeUp">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs" style={{ color: C.inkSoft }}>
            Ano
            <Select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="mt-1 block"
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs" style={{ color: C.inkSoft }}>
            Agrupar
            <Select value={gran} onChange={(e) => setGran(e.target.value)} className="mt-1 block">
              {GRANULARIDADES_RELATORIO.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => exportar("pdf")}
              disabled={finAno.loading || semDados}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              <Download size={13} /> Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => exportar("xlsx")}
              disabled={finAno.loading || semDados || baixando}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: C.amberSoft, color: C.amber, fontWeight: 600 }}
            >
              <Download size={13} /> {baixando ? "Gerando…" : "Baixar Excel"}
            </button>
          </div>
        </div>
      </Card>

      {finAno.loading ? (
        <Card>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
              <Skeleton key={i} height={34} rounded={8} />
            ))}
          </div>
        </Card>
      ) : semDados ? (
        <Card>
          <p className="text-sm" style={{ color: C.inkSoft }}>
            Nenhum lançamento em {ano}.
          </p>
        </Card>
      ) : (
        <FadeIn>
          <Card>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard
                label="Faturamento"
                value={fmtBRL(relatorio.totais.faturamento)}
                icon={Wallet}
                accent={C.green}
              />
              <StatCard
                label="Despesa"
                value={fmtBRL(relatorio.totais.despesa)}
                icon={TrendingUp}
                accent={C.red}
              />
              <StatCard
                label="Lucro"
                value={fmtBRL(relatorio.totais.lucro)}
                icon={Landmark}
                accent={relatorio.totais.lucro >= 0 ? C.green : C.red}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium text-right">Faturamento</th>
                    <th className="px-3 py-2 font-medium text-right">Despesa</th>
                    <th className="px-3 py-2 font-medium text-right">Lucro</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {relatorio.linhas.map((l) => (
                    <tr
                      key={l.periodo}
                      className="row-hover border-t"
                      style={{ borderColor: C.borderSoft }}
                    >
                      <td className="px-3 py-2" style={{ fontFamily: "inherit", color: C.inkSoft }}>
                        {rotuloPeriodoRelatorio(l.periodo, gran)}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtBRL(l.faturamento)}</td>
                      <td className="px-3 py-2 text-right">{fmtBRL(l.despesa)}</td>
                      <td
                        className="px-3 py-2 text-right"
                        style={{ color: l.lucro >= 0 ? C.green : C.red }}
                      >
                        {fmtBRL(l.lucro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}

/* --- Contas a receber: passageiros com reserva confirmada e pagamento
   ainda pendente — ver database/18-receita-automatica-contas-a-receber.sql.
   A receita nasce sozinha (trigger); esta tela é só cobrança do que falta
   receber, com botão de cobrança direta pelo WhatsApp. --- */
function ContasReceberView({ pix }) {
  const { contas, loading, error, registrarAjuste, registrando, verComprovante } =
    useContasReceber();
  const pixKey = pix?.key || PIX_KEY;
  const [ajusteAberto, setAjusteAberto] = useState(null); // reservation_id em edição
  const [ajusteVal, setAjusteVal] = useState({ categoria: "estorno", valor: "", descricao: "" });
  const [erroAjuste, setErroAjuste] = useState("");

  const abrirComprovante = async (path) => {
    setErroAjuste("");
    try {
      const url = await verComprovante(path);
      if (url) window.open(url, "_blank", "noopener");
    } catch (e) {
      setErroAjuste(mensagemAmigavel(e, "Não foi possível abrir o comprovante."));
    }
  };

  const vencida = (venc) => !!venc && venc < todayStr();

  const abrirCobranca = (c) => {
    const venc = c.vencimento ? fmtDate(c.vencimento) : "sem data definida";
    const msg =
      `Olá, ${c.nome}! Tudo bem? Aqui é da Rota Pirapemas. ` +
      `Notamos que sua passagem de ${venc} no valor de ${fmtBRL(c.valor_devido)} ainda está pendente de pagamento. ` +
      `Você pode pagar via Pix na chave ${pixKey}. Qualquer dúvida, estamos à disposição!`;
    window.open(`https://wa.me/55${digitos(c.telefone)}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const iniciarAjuste = (reservationId) => {
    setErroAjuste("");
    setAjusteAberto(reservationId);
    setAjusteVal({ categoria: "estorno", valor: "", descricao: "" });
  };
  const salvarAjuste = async () => {
    if (!ajusteVal.valor) return;
    setErroAjuste("");
    try {
      await registrarAjuste(ajusteAberto, {
        category: ajusteVal.categoria,
        amount: Number.parseFloat(ajusteVal.valor),
        description: ajusteVal.descricao || null,
      });
      setAjusteAberto(null);
    } catch (e) {
      setErroAjuste(mensagemAmigavel(e, "Não foi possível registrar o ajuste."));
    }
  };

  return (
    <div className="px-6 md:px-10 pb-10">
      {error && (
        <div
          className="mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <AlertTriangle size={14} />{" "}
          {mensagemAmigavel(error, "Erro ao carregar contas a receber.")}
        </div>
      )}
      <Card className="anim-fadeUp">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Passageiros com pagamento pendente</div>
          {loading && (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          )}
        </div>
        {contas.length === 0 && !loading ? (
          // Sem dados: nada de tabela de 5 colunas — no celular ela força
          // scroll horizontal mesmo vazia (a largura reservada pelas
          // colunas independe de ter linha ou não) e cortava até esta
          // própria mensagem.
          <p className="text-center py-8 text-xs" style={{ color: C.inkFaint }}>
            Nenhuma conta pendente — tudo em dia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                  <th className="px-4 py-2 font-medium">Passageiro</th>
                  <th className="px-4 py-2 font-medium">Valor devido</th>
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <React.Fragment key={c.reservation_id}>
                    <tr className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
                      <td className="px-4 py-2">
                        <div>{c.nome}</div>
                        <div className="text-xs" style={{ color: C.inkFaint }}>
                          {c.telefone}
                        </div>
                      </td>
                      <td
                        className="px-4 py-2"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {fmtBRL(c.valor_devido)}
                      </td>
                      <td className="px-4 py-2" style={{ color: C.inkSoft }}>
                        {c.vencimento ? fmtDate(c.vencimento) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Pill
                          color={vencida(c.vencimento) ? C.red : C.amber}
                          bg={vencida(c.vencimento) ? C.redSoft : C.amberSoft}
                        >
                          {vencida(c.vencimento) ? "Vencido" : "No prazo"}
                        </Pill>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => abrirCobranca(c)}
                            className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                            style={{ background: C.greenSoft, color: C.green, fontWeight: 600 }}
                          >
                            <MessageCircle size={12} /> Cobrar no WhatsApp
                          </button>
                          <button
                            onClick={() => iniciarAjuste(c.reservation_id)}
                            className="btn-press text-xs px-2 py-1 rounded-md"
                            style={{ background: C.panel2, color: C.inkSoft }}
                          >
                            Estorno/ajuste
                          </button>
                          {c.comprovante_recebido && (
                            <button
                              onClick={() => abrirComprovante(c.comprovante_path)}
                              disabled={!c.comprovante_path}
                              className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md disabled:opacity-40"
                              style={{ background: C.blueSoft, color: C.blue, fontWeight: 600 }}
                            >
                              <Receipt size={12} /> Ver comprovante
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {ajusteAberto === c.reservation_id && (
                      <tr
                        className="border-t"
                        style={{ borderColor: C.borderSoft, background: C.panel2 }}
                      >
                        <td colSpan={5} className="px-4 py-3">
                          {erroAjuste && (
                            <div className="mb-2 text-xs" style={{ color: C.red }}>
                              {erroAjuste}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={ajusteVal.categoria}
                              onChange={(e) =>
                                setAjusteVal({ ...ajusteVal, categoria: e.target.value })
                              }
                            >
                              <option value="estorno">Estorno</option>
                              <option value="reembolso">Reembolso</option>
                              <option value="ajuste">Ajuste</option>
                            </Select>
                            <TextInput
                              type="number"
                              placeholder="Valor"
                              value={ajusteVal.valor}
                              onChange={(e) =>
                                setAjusteVal({ ...ajusteVal, valor: e.target.value })
                              }
                              className="w-28"
                            />
                            <TextInput
                              placeholder="Descrição (opcional)"
                              value={ajusteVal.descricao}
                              onChange={(e) =>
                                setAjusteVal({ ...ajusteVal, descricao: e.target.value })
                              }
                              className="flex-1 min-w-[160px]"
                            />
                            <button
                              onClick={salvarAjuste}
                              disabled={registrando || !ajusteVal.valor}
                              className="btn-press text-xs px-3 py-1.5 rounded-md"
                              style={{ background: C.amberSoft, color: C.amber, fontWeight: 600 }}
                            >
                              Registrar
                            </button>
                            <button
                              onClick={() => setAjusteAberto(null)}
                              className="btn-press text-xs px-2 py-1.5 rounded-md"
                              style={{ color: C.inkFaint }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
