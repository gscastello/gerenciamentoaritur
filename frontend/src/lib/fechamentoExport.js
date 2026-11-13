// src/lib/fechamentoExport.js
//
// Exporta o fechamento do mês (issue #365) já montado por
// domain/fechamentoDoMes.js:
//   - PDF: janela pronta para imprimir/salvar como PDF (sem dependência);
//   - planilha .xlsx com uma aba por parte (exceljs, import dinâmico);
//   - .zip com as fotos das notas (jszip), com nomes por data/categoria/valor.
// Texto que veio do banco (descrições) é escapado antes de entrar no HTML.

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const tabela = (cabecalho, linhas, numericas = []) =>
  linhas.length === 0
    ? `<p class="vazio">Nada no mês.</p>`
    : `<table><thead><tr>${cabecalho
        .map((h, i) => `<th${numericas.includes(i) ? ' class="n"' : ""}>${esc(h)}</th>`)
        .join("")}</tr></thead><tbody>${linhas
        .map(
          (l) =>
            `<tr>${l
              .map((c, i) => `<td${numericas.includes(i) ? ' class="n"' : ""}>${esc(c)}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;

/** HTML do fechamento (exportado para teste). */
export function htmlDoFechamento(f) {
  const resumo = f.resumo
    .map(
      (r) =>
        `<tr${r.destaque ? ' class="destaque"' : ""}><td>${esc(r.rotulo)}</td><td class="n ${
          r.valor < 0 ? "neg" : ""
        }">${esc(fmtBRL(r.valor))}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(f.titulo)} — Gestão AriTur</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #16191a; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 6px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; font-size: 12px; text-align: left; }
  th { background: #f2f2f2; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .neg { color: #b00020; }
  tr.destaque td { font-weight: bold; background: #fafafa; }
  .aviso { font-size: 12px; color: #7a4b00; background: #fff6e0; padding: 6px 8px; margin: 4px 0; }
  .vazio { font-size: 12px; color: #888; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head><body>
  <h1>Gestão AriTur — ${esc(f.titulo)}</h1>
  <div class="sub">Para o contador. Gerado em ${esc(
    new Date(f.geradoEm ?? Date.now()).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }),
  )} (São Luís, MA).</div>
  ${f.avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join("")}
  <h2>Resultado do mês</h2>
  <table><tbody>${resumo}</tbody></table>
  <h2>Receitas por categoria</h2>
  ${tabela(
    ["Categoria", "Total"],
    f.receitasPorCategoria.map((r) => [r.categoria, fmtBRL(r.total)]),
    [1],
  )}
  <h2>Despesas por categoria</h2>
  ${tabela(
    ["Categoria", "Total"],
    f.despesasPorCategoria.map((r) => [r.categoria, fmtBRL(r.total)]),
    [1],
  )}
  <h2>Passagens por sentido (reservas do app)</h2>
  ${tabela(
    ["Sentido", "Viagens", "Passageiros", "Valor", "Ticket médio"],
    f.porSentido.map((s) => [
      s.sentido,
      s.viagens,
      s.passageiros,
      fmtBRL(s.valor),
      s.ticketMedio != null ? fmtBRL(s.ticketMedio) : "—",
    ]),
    [1, 2, 3, 4],
  )}
  <h2>Por forma de pagamento (reservas do app)</h2>
  ${tabela(
    ["Forma", "Valor"],
    f.porForma.map((p) => [p.forma, fmtBRL(p.valor)]),
    [1],
  )}
  <h2>Receita por viagem (reservas do app)</h2>
  ${tabela(
    ["Data", "Sentido", "Passageiros", "Valor"],
    f.viagens.map((v) => [fmtData(v.data), v.sentido, v.passageiros, fmtBRL(v.valor)]),
    [2, 3],
  )}
  <h2>Lançamentos do mês</h2>
  ${tabela(
    ["Data", "Tipo", "Categoria", "Descrição", "Valor", "Foto da nota"],
    f.lancamentos.map((l) => [
      fmtData(l.data),
      l.tipo,
      l.categoria,
      l.descricao,
      fmtBRL(l.valor),
      l.foto || "—",
    ]),
    [4],
  )}
  <h2>Pagamentos recebidos (baixa no app)</h2>
  ${tabela(
    ["Data", "Forma", "Viagem", "Valor"],
    f.pagamentos.map((p) => [
      fmtData(p.data),
      p.forma,
      `${fmtData(p.viagem)} ${p.sentido}`.trim(),
      fmtBRL(p.valor),
    ]),
    [3],
  )}
  <h2>Contas quitadas</h2>
  ${tabela(
    ["Conta", "Venceu", "Quitada", "Valor"],
    f.contasQuitadas.map((c) => [
      c.titulo,
      fmtData(c.venceEm),
      fmtData(c.quitadoEm),
      c.valor != null ? fmtBRL(c.valor) : "—",
    ]),
    [3],
  )}
</body></html>`;
}

export function abrirFechamentoPDF(f) {
  const janela = window.open("", "_blank");
  if (!janela) {
    throw new Error(
      "O navegador bloqueou a janela do fechamento. Permita pop-ups para este site e tente de novo.",
    );
  }
  janela.document.write(htmlDoFechamento(f));
  janela.document.close();
  setTimeout(() => janela.print(), 400);
}

export async function baixarFechamentoXLSX(f) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão AriTur";
  wb.created = new Date();
  const BRL = '"R$" #,##0.00';
  const aba = (nome, colunas, linhas, dinheiro = []) => {
    const ws = wb.addWorksheet(nome);
    ws.columns = colunas.map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    for (const l of linhas) ws.addRow(l);
    for (const k of dinheiro) ws.getColumn(k).numFmt = BRL;
    return ws;
  };
  const resumo = aba(
    "Resultado",
    [
      ["Item", "rotulo", 36],
      ["Valor", "valor", 18],
    ],
    f.resumo,
    ["valor"],
  );
  f.resumo.forEach((r, i) => {
    if (r.destaque) resumo.getRow(i + 2).font = { bold: true };
  });
  for (const a of f.avisos) resumo.addRow({ rotulo: a });
  aba(
    "Receitas por categoria",
    [
      ["Categoria", "categoria", 28],
      ["Total", "total", 16],
    ],
    f.receitasPorCategoria,
    ["total"],
  );
  aba(
    "Despesas por categoria",
    [
      ["Categoria", "categoria", 28],
      ["Total", "total", 16],
    ],
    f.despesasPorCategoria,
    ["total"],
  );
  aba(
    "Por sentido",
    [
      ["Sentido", "sentido", 26],
      ["Viagens", "viagens", 10],
      ["Passageiros", "passageiros", 12],
      ["Valor", "valor", 16],
      ["Ticket médio", "ticketMedio", 14],
    ],
    f.porSentido,
    ["valor", "ticketMedio"],
  );
  aba(
    "Forma de pagamento",
    [
      ["Forma", "forma", 18],
      ["Valor", "valor", 16],
    ],
    f.porForma,
    ["valor"],
  );
  aba(
    "Por viagem",
    [
      ["Data", "data", 12],
      ["Sentido", "sentido", 10],
      ["Passageiros", "passageiros", 12],
      ["Valor", "valor", 16],
    ],
    f.viagens,
    ["valor"],
  );
  aba(
    "Lançamentos",
    [
      ["Data", "data", 12],
      ["Tipo", "tipo", 10],
      ["Categoria", "categoria", 22],
      ["Descrição", "descricao", 40],
      ["Valor", "valor", 14],
      ["Foto da nota (no .zip)", "foto", 40],
    ],
    f.lancamentos,
    ["valor"],
  );
  aba(
    "Pagamentos",
    [
      ["Data", "data", 12],
      ["Forma", "forma", 12],
      ["Viagem", "viagem", 12],
      ["Sentido", "sentido", 10],
      ["Valor", "valor", 14],
    ],
    f.pagamentos,
    ["valor"],
  );
  aba(
    "Contas quitadas",
    [
      ["Conta", "titulo", 30],
      ["Venceu", "venceEm", 12],
      ["Quitada", "quitadoEm", 12],
      ["Valor", "valor", 14],
    ],
    f.contasQuitadas,
    ["valor"],
  );
  const buffer = await wb.xlsx.writeBuffer();
  baixarBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `fechamento-${f.mes}.xlsx`,
  );
}

/**
 * Baixa as fotos das notas num .zip. `urlDe(arquivo)` devolve uma URL assinada.
 * Devolve quantas entraram e quantas falharam (a foto pode ter sido apagada).
 */
export async function baixarFotosDasNotas(f, urlDe, aoAvancar) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let ok = 0;
  let falhas = 0;
  for (const [i, nt] of f.notas.entries()) {
    try {
      const resp = await fetch(await urlDe(nt.arquivo));
      if (!resp.ok) throw new Error(String(resp.status));
      zip.file(nt.nome, await resp.blob());
      ok += 1;
    } catch {
      falhas += 1;
    }
    aoAvancar?.(Math.round(((i + 1) / f.notas.length) * 100));
  }
  if (ok > 0) baixarBlob(await zip.generateAsync({ type: "blob" }), `notas-${f.mes}.zip`);
  return { ok, falhas };
}
