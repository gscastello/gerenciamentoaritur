// src/app/tabs/ExtratoTab.jsx
//
// Extrato do banco (issue #364), aba do grupo Gestão. O dono manda o extrato do
// mês (OFX ou CSV); o app guarda os movimentos sem repetir e mostra, pela regra
// de domain/extrato.js, o que bate, o que falta lançar (um toque), o que está
// em dobro e o que foi lançado no app e não aparece no banco.

import { Check, EyeOff, FileUp, Landmark, RotateCcw, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { categoriaSugerida } from "../../domain/extrato.js";
import { useExpenseCategories } from "../../hooks/useExpenseCategories.js";
import { useExtrato } from "../../hooks/useExtrato.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  FadeIn,
  Presence,
  ProgressBar,
  Skeleton,
  Spinner,
  fadeScale,
} from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, Header, Select, TextInput, fmtBRL, fmtDate } from "../tabShared.jsx";

const RECEITAS = [
  { slug: "passagem", label: "Passagem" },
  { slug: "outro", label: "Outra receita" },
];

const SITUACAO = {
  bate: "Lançado",
  bate_pagamento: "Pagamento de reserva",
  no_total_do_dia: "Dentro da receita do dia",
  ignorada: "Ignorado",
};

function Valor({ v }) {
  return (
    <span className="font-semibold tabular-nums" style={{ color: v > 0 ? C.green : C.red }}>
      {v > 0 ? "+" : "−"} {fmtBRL(Math.abs(v))}
    </span>
  );
}

function Resumo({ r }) {
  const itens = [
    { label: "Batem", n: r.bate, cor: C.green },
    { label: "Falta lançar", n: r.falta, cor: r.falta ? C.amber : C.inkFaint },
    { label: "Em dobro no app", n: r.emDobro, cor: r.emDobro ? C.red : C.inkFaint },
    { label: "No app, fora do banco", n: r.semPar, cor: r.semPar ? C.amber : C.inkFaint },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="resumo-do-extrato">
      {itens.map((i) => (
        <div key={i.label} className="rounded-lg p-2.5" style={{ background: C.panel2 }}>
          <div className="text-[11px]" style={{ color: C.inkSoft }}>
            {i.label}
          </div>
          <div className="text-xl font-bold" style={{ color: i.cor }}>
            {i.n}
          </div>
        </div>
      ))}
      <div className="col-span-2 md:col-span-4 text-xs" style={{ color: C.inkSoft }}>
        Entradas {fmtBRL(r.entradas)} · Saídas {fmtBRL(r.saidas)}
        {r.ignoradas ? ` · ${r.ignoradas} ignorado(s)` : ""}
      </div>
    </div>
  );
}

function LinhaQueFalta({ linha, categorias, onLancar, onIgnorar, salvando }) {
  const opcoes = linha.valor > 0 ? RECEITAS : categorias;
  // a sugestão só vale se a categoria existe; senão "outro"
  const [cat, setCat] = useState(() => {
    const s = categoriaSugerida(linha);
    return opcoes.some((c) => c.slug === s) ? s : "outro";
  });
  const [enviando, setEnviando] = useState(false);
  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{ background: C.panel2 }}
      data-testid="movimento-falta"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
            {linha.descricao || "Sem descrição"}
          </div>
          <div className="text-[11px]" style={{ color: C.inkFaint }}>
            {fmtDate(linha.data)} · {linha.conta}
          </div>
        </div>
        <Valor v={linha.valor} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={`Categoria de ${linha.descricao || "movimento"}`}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="text-xs py-1.5"
        >
          {opcoes.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          disabled={salvando}
          onClick={async () => {
            setEnviando(true);
            try {
              await onLancar(linha.id, cat);
            } finally {
              setEnviando(false);
            }
          }}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-60"
          style={{ background: C.amber, color: C.onBrand }}
        >
          {enviando ? <Spinner size={12} /> : <Check size={13} />} Lançar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => onIgnorar(linha.id, true)}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md disabled:opacity-60"
          style={{ background: C.panel, color: C.inkSoft, border: `1px solid ${C.border}` }}
          title="Transferência entre contas, aplicação, movimento que não é da empresa…"
        >
          <EyeOff size={13} /> Ignorar
        </button>
      </div>
    </div>
  );
}

function ListaDoApp({ titulo, ajuda, itens, rotulo, testid }) {
  if (itens.length === 0) return null;
  return (
    <Card>
      <div className="text-sm font-semibold">{titulo}</div>
      <p className="text-xs mt-0.5 mb-2" style={{ color: C.inkSoft }}>
        {ajuda}
      </p>
      <div className="space-y-1.5" data-testid={testid}>
        {itens.map((x) => (
          <FadeIn key={x.id}>
            <div
              className="rounded-lg px-3 py-2 flex items-center justify-between gap-3 text-xs"
              style={{ background: C.panel2 }}
            >
              <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                {fmtDate(x.entry_date)} · {rotulo(x.category)}
                {x.description ? ` · ${x.description}` : ""}
              </span>
              <Valor v={x.type === "receita" ? x.amount : -x.amount} />
            </div>
          </FadeIn>
        ))}
      </div>
    </Card>
  );
}

export default function ExtratoTab() {
  const ext = useExtrato();
  const cats = useExpenseCategories();
  const inputRef = useRef(null);
  const idInput = useId();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const { conciliacao: c } = ext;
  const faltam = c.linhas.filter((l) => l.situacao === "falta_lancar");
  const conferidas = c.linhas.filter((l) => l.situacao !== "falta_lancar");
  const categoriasDespesa = [...cats.despesa, ...cats.gestao].map((x) => ({
    slug: x.slug,
    label: x.label,
  }));
  if (!categoriasDespesa.some((x) => x.slug === "outro"))
    categoriasDespesa.push({ slug: "outro", label: "Outro" });

  const enviar = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro("");
    setAviso("");
    try {
      const r = await ext.importar(arquivo);
      if (!r.ok) return setErro(r.erro);
      setAviso(
        `${r.lidos} movimento(s) lido(s) de ${r.conta}: ${r.novos} novo(s)${
          r.repetidos ? `, ${r.repetidos} já estava(m) guardado(s)` : ""
        }.`,
      );
    } catch (err) {
      setErro(mensagemAmigavel(err, "Não foi possível ler o extrato."));
    }
  };
  const acao =
    (fn, msg) =>
    async (...args) => {
      setErro("");
      try {
        await fn(...args);
      } catch (err) {
        setErro(mensagemAmigavel(err, msg));
      }
    };

  return (
    <div>
      <Header
        title="Extrato do banco"
        subtitle="Mande o extrato do mês (OFX ou CSV) e o app confere com os lançamentos e os pagamentos."
      />
      <div className="px-4 md:px-10 pb-10 space-y-4">
        {(erro || ext.error) && (
          <ErrorBanner
            onDismiss={erro ? () => setErro("") : undefined}
            onRetry={erro ? undefined : ext.recarregar}
          >
            {erro || mensagemAmigavel(ext.error, "Não foi possível carregar o extrato.")}
          </ErrorBanner>
        )}

        <Card>
          <input
            ref={inputRef}
            id={idInput}
            type="file"
            accept=".ofx,.csv,.txt,text/csv,application/x-ofx"
            className="hidden"
            onChange={enviar}
            data-testid="arquivo-do-extrato"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={ext.importando}
            className="btn-press w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-lg font-semibold disabled:opacity-60"
            style={{ background: C.amberSoft, color: C.brandText, border: `1px dashed ${C.amber}` }}
          >
            <Upload size={16} />{" "}
            {ext.importando ? "Lendo o extrato…" : "Enviar extrato (OFX ou CSV)"}
          </button>
          {ext.importando && (
            <div className="mt-2">
              <ProgressBar label="Lendo o extrato" />
            </div>
          )}
          {aviso && (
            <output className="block text-xs mt-2" style={{ color: C.green }}>
              {aviso}
            </output>
          )}
          <p className="text-[11px] mt-2" style={{ color: C.inkFaint }}>
            No app do banco (InfinitePay e outros), exporte o extrato em OFX ou CSV. Mandar o mesmo
            arquivo de novo não repete nada.
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Landmark size={16} style={{ color: C.brandText }} /> Conferência do mês
            </div>
            <TextInput
              type="month"
              aria-label="Mês do extrato"
              value={ext.mes}
              onChange={(e) => e.target.value && ext.setMes(e.target.value)}
              className="text-xs py-1.5 w-auto"
            />
          </div>
          {ext.loading && c.linhas.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={58} rounded={10} />
              ))}
            </div>
          ) : c.linhas.length === 0 ? (
            <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
              <FileUp size={18} className="mx-auto mb-1" />
              Nenhum movimento do banco neste mês. Envie o extrato acima.
            </div>
          ) : (
            <FadeIn>
              <Resumo r={c.resumo} />
            </FadeIn>
          )}
        </Card>

        <Presence when={faltam.length > 0} duration={200} {...fadeScale}>
          <Card>
            <div className="text-sm font-semibold">Falta lançar ({faltam.length})</div>
            <p className="text-xs mt-0.5 mb-2" style={{ color: C.inkSoft }}>
              Movimentos do banco sem lançamento igual (mesmo valor, até 3 dias). Escolha a
              categoria e lance, ou ignore o que não é da empresa.
            </p>
            <div className="space-y-2" data-testid="lista-falta-lancar">
              {/* todas as linhas passam aqui: a que foi lançada ou ignorada sai com transição */}
              {c.linhas.map((l) => (
                <Presence
                  key={l.id}
                  when={l.situacao === "falta_lancar"}
                  duration={200}
                  {...fadeScale}
                >
                  <FadeIn>
                    <LinhaQueFalta
                      linha={l}
                      categorias={categoriasDespesa}
                      salvando={ext.salvando}
                      onLancar={acao(ext.lancar, "Não foi possível lançar.")}
                      onIgnorar={acao(ext.ignorar, "Não foi possível ignorar.")}
                    />
                  </FadeIn>
                </Presence>
              ))}
            </div>
          </Card>
        </Presence>

        <ListaDoApp
          titulo={`Em dobro no app (${c.emDobro.length})`}
          ajuda="Lançamentos com o mesmo valor de um movimento que já bateu, em até 3 dias: pode ser o mesmo gasto lançado duas vezes. Confira no Financeiro."
          itens={c.emDobro}
          rotulo={cats.rotulo}
          testid="lista-em-dobro"
        />
        <ListaDoApp
          titulo={`Lançado no app, não está no banco (${c.semPar.length})`}
          ajuda="Pode ter sido pago em dinheiro ou por outra conta. A receita de passagens do dia não entra aqui (tem dinheiro)."
          itens={c.semPar}
          rotulo={cats.rotulo}
          testid="lista-sem-par"
        />

        {conferidas.length > 0 && (
          <Card>
            <details>
              <summary className="text-sm font-semibold cursor-pointer">
                Conferidos ({conferidas.length})
              </summary>
              <div className="space-y-1.5 mt-2" data-testid="lista-conferidos">
                {conferidas.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-lg px-3 py-2 flex items-center justify-between gap-3 text-xs"
                    style={{ background: C.panel2 }}
                  >
                    <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                      {fmtDate(l.data)} · {l.descricao || "Sem descrição"}
                      <span className="block text-[11px]" style={{ color: C.inkFaint }}>
                        {SITUACAO[l.situacao]}
                        {l.par ? ` · ${cats.rotulo(l.par.category)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Valor v={l.valor} />
                      {l.situacao === "ignorada" && (
                        <button
                          type="button"
                          onClick={acao(
                            () => ext.ignorar(l.id, false),
                            "Não foi possível desfazer.",
                          )}
                          aria-label={`Desfazer ignorar ${l.descricao}`}
                          className="btn-press p-1 rounded"
                          style={{ color: C.inkSoft }}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}
