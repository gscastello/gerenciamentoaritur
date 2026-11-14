// src/app/tabs/FechamentoTab.jsx
//
// Fechamento do mês para o contador (issue #365), aba do grupo Gestão. Abre no
// mês anterior (o sino avisa todo dia 1): resultado, receitas, despesas,
// passagens por sentido e forma de pagamento, a estimativa do DAS e os
// downloads — PDF, planilha e as fotos das notas num .zip.

import { AlertTriangle, FileSpreadsheet, FileText, Images } from "lucide-react";
import { useState } from "react";
import { useFechamento } from "../../hooks/useFechamento.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  abrirFechamentoPDF,
  baixarFechamentoXLSX,
  baixarFotosDasNotas,
} from "../../lib/fechamentoExport.js";
import { FadeIn, ProgressBar, Skeleton, Spinner } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, Header, TextInput, fmtBRL } from "../tabShared.jsx";

// Só o PDF é o botão principal (vermelho); planilha e fotos são secundários (auditoria, issue #397:
// três botões vermelhos disputavam a atenção, e o desabilitado parecia vinho apagado).
function Botao({ icone: Icone, children, onClick, ocupado, disabled, testid, principal = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado || disabled}
      data-testid={testid}
      className="btn-press flex items-center justify-center gap-2 text-sm px-3 min-h-[44px] rounded-xl font-semibold border disabled:opacity-50"
      style={
        principal
          ? { background: C.brand, color: C.onBrand, borderColor: C.brand }
          : { background: C.panel2, color: C.ink, borderColor: C.border }
      }
    >
      {ocupado ? <Spinner size={14} /> : <Icone size={16} />} {children}
    </button>
  );
}

function Tabela({ titulo, linhas }) {
  if (linhas.length === 0) return null;
  return (
    <Card>
      <div className="text-sm font-semibold mb-2">{titulo}</div>
      <div className="space-y-1">
        {linhas.map(([rotulo, valor, extra]) => (
          <div key={rotulo} className="flex items-center justify-between gap-3 text-xs">
            <span style={{ color: C.inkSoft }}>
              {rotulo}
              {extra ? <span style={{ color: C.inkFaint }}> · {extra}</span> : null}
            </span>
            <span className="font-semibold tabular-nums">{fmtBRL(valor)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function FechamentoTab() {
  const fx = useFechamento();
  const f = fx.fechamento;
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState(null);

  const fazer = (qual, fn) => async () => {
    setErro("");
    setAviso("");
    setOcupado(qual);
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível gerar o arquivo."));
    } finally {
      setOcupado("");
      setProgresso(null);
    }
  };
  const fotos = fazer("fotos", async () => {
    setProgresso(0);
    const r = await baixarFotosDasNotas(f, fx.urlDaNota, setProgresso);
    setAviso(
      r.ok === 0
        ? "Nenhuma foto pôde ser baixada."
        : `${r.ok} foto(s) no .zip${r.falhas ? `; ${r.falhas} não foram encontradas` : ""}.`,
    );
  });

  return (
    <div>
      <Header
        title="Fechamento do mês"
        subtitle="O pacote do mês para o contador: resultado, receitas, despesas, notas e a estimativa do DAS."
      />
      <div className="px-4 md:px-10 pb-10 space-y-4">
        {(erro || fx.error) && (
          <ErrorBanner
            onDismiss={erro ? () => setErro("") : undefined}
            onRetry={erro ? undefined : fx.recarregar}
          >
            {erro || mensagemAmigavel(fx.error, "Não foi possível montar o fechamento.")}
          </ErrorBanner>
        )}

        <Card>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold">{f?.titulo ?? "Fechamento"}</div>
            <TextInput
              type="month"
              aria-label="Mês do fechamento"
              value={fx.mes}
              onChange={(e) => e.target.value && fx.setMes(e.target.value)}
              className="text-xs py-1.5 w-auto"
            />
          </div>
          {fx.loading && !f ? (
            <div className="space-y-2 mt-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={22} rounded={6} />
              ))}
            </div>
          ) : f ? (
            <FadeIn>
              <div className="mt-3 space-y-1" data-testid="resultado-do-mes">
                {f.resumo.map((r) => (
                  <div
                    key={r.rotulo}
                    className={`flex items-center justify-between gap-3 ${r.destaque ? "text-sm font-bold pt-1" : "text-xs"}`}
                  >
                    <span style={{ color: r.destaque ? C.ink : C.inkSoft }}>{r.rotulo}</span>
                    <span
                      className="tabular-nums"
                      style={{ color: r.valor < 0 ? C.red : r.destaque ? C.green : C.ink }}
                    >
                      {fmtBRL(r.valor)}
                    </span>
                  </div>
                ))}
                {f.margemPct != null && (
                  <div className="text-[11px]" style={{ color: C.inkFaint }}>
                    Margem antes do imposto: {String(f.margemPct).replace(".", ",")}% ·{" "}
                    {f.passageiros} passageiro(s) nas reservas do app
                    {f.ticketMedio != null ? ` · ticket médio ${fmtBRL(f.ticketMedio)}` : ""}
                  </div>
                )}
              </div>
              {f.avisos.length > 0 && (
                <div className="mt-3 space-y-1.5" data-testid="avisos-do-fechamento">
                  {f.avisos.map((a) => (
                    <div
                      key={a}
                      className="text-[11px] rounded-md px-2.5 py-1.5 flex gap-2"
                      style={{ background: C.amberSoft, color: C.ink }}
                    >
                      <AlertTriangle
                        size={13}
                        className="shrink-0 mt-0.5"
                        style={{ color: C.amber }}
                      />
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </FadeIn>
          ) : null}
        </Card>

        {f && (
          <FadeIn>
            <Card>
              <div className="text-sm font-semibold mb-2">Baixar para o contador</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Botao
                  icone={FileText}
                  testid="baixar-pdf"
                  ocupado={ocupado === "pdf"}
                  disabled={!!ocupado}
                  principal
                  onClick={fazer("pdf", () => abrirFechamentoPDF(f))}
                >
                  PDF
                </Botao>
                <Botao
                  icone={FileSpreadsheet}
                  testid="baixar-planilha"
                  ocupado={ocupado === "xlsx"}
                  disabled={!!ocupado}
                  onClick={fazer("xlsx", () => baixarFechamentoXLSX(f))}
                >
                  Planilha
                </Botao>
                <Botao
                  icone={Images}
                  testid="baixar-fotos"
                  ocupado={ocupado === "fotos"}
                  disabled={!!ocupado || f.notas.length === 0}
                  onClick={fotos}
                >
                  Fotos das notas ({f.notas.length})
                </Botao>
              </div>
              {progresso != null && (
                <div className="mt-2">
                  <ProgressBar value={progresso} label="Baixando as fotos das notas" />
                </div>
              )}
              {aviso && (
                <output className="block text-xs mt-2" style={{ color: C.green }}>
                  {aviso}
                </output>
              )}
            </Card>
          </FadeIn>
        )}

        {f && (
          <div className="grid md:grid-cols-2 gap-4">
            <Tabela
              titulo="Despesas por categoria"
              linhas={f.despesasPorCategoria.map((d) => [d.categoria, d.total])}
            />
            <Tabela
              titulo="Receitas por categoria"
              linhas={f.receitasPorCategoria.map((d) => [d.categoria, d.total])}
            />
            <Tabela
              titulo="Passagens por sentido (reservas do app)"
              linhas={f.porSentido.map((s) => [
                s.sentido,
                s.valor,
                `${s.passageiros} passageiro(s), ${s.viagens} viagem(ns)`,
              ])}
            />
            <Tabela
              titulo="Por forma de pagamento (reservas do app)"
              linhas={f.porForma.map((p) => [p.forma, p.valor])}
            />
          </div>
        )}
      </div>
    </div>
  );
}
