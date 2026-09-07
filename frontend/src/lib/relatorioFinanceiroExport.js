// src/lib/relatorioFinanceiroExport.js
//
// Export do relatório financeiro por período (issue #12). Recebe o objeto
// já agregado por `domain/relatorioFinanceiro.js` — este módulo só formata
// e empacota:
//   - PDF: abre uma janela pronta pra imprimir/salvar (sem dependência).
//   - XLSX: uma planilha "Resumo" + uma "Despesas por categoria"
//     (exceljs, import dinâmico — não engorda o bundle inicial).
//
// A lib `xlsx`/SheetJS é proibida no projeto (vuln HIGH sem correção) —
// usar exceljs, igual ao backupExport.js.

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const fmtBRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-09" -> "set/2026" · "2026-09-07" -> "07/09/2026" · "2026" -> "2026" */
function rotuloPeriodo(periodo, granularidade) {
  if (typeof periodo !== "string") return "—";
  if (granularidade === "ano") return periodo;
  const p = periodo.split("-");
  if (granularidade === "mes" && p.length >= 2) {
    const mi = Number(p[1]) - 1;
    return `${MESES_ABREV[mi] ?? p[1]}/${p[0]}`;
  }
  if (granularidade === "dia" && p.length >= 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return periodo;
}

const TITULO_GRAN = { dia: "por dia", mes: "por mês", ano: "por ano" };

function nomeArquivo(extensao) {
  const agora = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `relatorio-financeiro-${agora}.${extensao}`;
}

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function geradoEmTexto(relatorio) {
  const d = relatorio?.geradoEm ? new Date(relatorio.geradoEm) : new Date();
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

/** Relatório em HTML numa janela nova — Ctrl+P salva como PDF. */
export function abrirRelatorioFinanceiroPDF(relatorio) {
  const gran = relatorio?.granularidade ?? "mes";
  const linhas = relatorio?.linhas ?? [];
  const totais = relatorio?.totais ?? { faturamento: 0, despesa: 0, lucro: 0 };
  const porCategoria = relatorio?.porCategoria ?? [];
  const escopo = relatorio?.escopo ? ` — ${relatorio.escopo}` : "";

  const corpoLinhas = linhas
    .map(
      (l) =>
        `<tr><td>${rotuloPeriodo(l.periodo, gran)}</td>` +
        `<td class="n">${fmtBRL(l.faturamento)}</td>` +
        `<td class="n">${fmtBRL(l.despesa)}</td>` +
        `<td class="n ${l.lucro < 0 ? "neg" : "pos"}">${fmtBRL(l.lucro)}</td></tr>`,
    )
    .join("");

  const corpoCategorias = porCategoria
    .map((c) => `<tr><td>${c.categoria}</td><td class="n">${fmtBRL(c.total)}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório financeiro — Gestão AriTur</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #16191a; }
  h1 { font-size: 19px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; max-width: 560px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
  th { background: #f2f2f2; text-align: left; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.neg { color: #b00020; }
  td.pos { color: #0a7d3b; }
  tfoot td { font-weight: bold; background: #fafafa; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Gestão AriTur — Relatório financeiro (${TITULO_GRAN[gran] ?? gran})${escopo}</h1>
  <div class="sub">Gerado em ${geradoEmTexto(relatorio)} (São Luís, MA)</div>
  <table>
    <thead><tr><th>Período</th><th class="n">Faturamento</th><th class="n">Despesa</th><th class="n">Lucro</th></tr></thead>
    <tbody>${corpoLinhas || '<tr><td colspan="4">Sem lançamentos no período.</td></tr>'}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td class="n">${fmtBRL(totais.faturamento)}</td>
      <td class="n">${fmtBRL(totais.despesa)}</td>
      <td class="n">${fmtBRL(totais.lucro)}</td>
    </tr></tfoot>
  </table>
  ${
    corpoCategorias
      ? `<h2>Despesas por categoria</h2>
  <table>
    <thead><tr><th>Categoria</th><th class="n">Total</th></tr></thead>
    <tbody>${corpoCategorias}</tbody>
  </table>`
      : ""
  }
</body></html>`;

  const janela = window.open("", "_blank");
  if (!janela) {
    throw new Error("O navegador bloqueou a janela do relatório. Permita pop-ups para este site e tente de novo.");
  }
  janela.document.write(html);
  janela.document.close();
  setTimeout(() => janela.print(), 400);
}

/** Relatório em .xlsx (2 abas). */
export async function baixarRelatorioFinanceiroXLSX(relatorio) {
  const gran = relatorio?.granularidade ?? "mes";
  const linhas = relatorio?.linhas ?? [];
  const totais = relatorio?.totais ?? { faturamento: 0, despesa: 0, lucro: 0, lancamentos: 0 };
  const porCategoria = relatorio?.porCategoria ?? [];

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão AriTur";
  workbook.created = relatorio?.geradoEm ? new Date(relatorio.geradoEm) : new Date();

  const resumo = workbook.addWorksheet("Resumo");
  resumo.columns = [
    { header: "Período", key: "periodo", width: 16 },
    { header: "Faturamento", key: "faturamento", width: 16 },
    { header: "Despesa", key: "despesa", width: 16 },
    { header: "Lucro", key: "lucro", width: 16 },
    { header: "Lançamentos", key: "lancamentos", width: 14 },
  ];
  resumo.getRow(1).font = { bold: true };
  for (const l of linhas) {
    resumo.addRow({
      periodo: rotuloPeriodo(l.periodo, gran),
      faturamento: l.faturamento,
      despesa: l.despesa,
      lucro: l.lucro,
      lancamentos: l.lancamentos,
    });
  }
  const totalRow = resumo.addRow({
    periodo: "Total",
    faturamento: totais.faturamento,
    despesa: totais.despesa,
    lucro: totais.lucro,
    lancamentos: totais.lancamentos,
  });
  totalRow.font = { bold: true };
  for (const col of ["faturamento", "despesa", "lucro"]) {
    resumo.getColumn(col).numFmt = '"R$" #,##0.00';
  }

  const cats = workbook.addWorksheet("Despesas por categoria");
  cats.columns = [
    { header: "Categoria", key: "categoria", width: 24 },
    { header: "Total", key: "total", width: 16 },
  ];
  cats.getRow(1).font = { bold: true };
  for (const c of porCategoria) cats.addRow({ categoria: c.categoria, total: c.total });
  cats.getColumn("total").numFmt = '"R$" #,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nomeArquivo("xlsx"),
  );
}
