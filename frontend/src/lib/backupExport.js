// src/lib/backupExport.js
//
// Formatos de exportação do backup completo (database/17-backup-completo.sql).
// O jsonb já vem pronto do servidor — este módulo só empacota em arquivo:
//   - JSON: nativo, sem dependência.
//   - CSV: um arquivo por categoria, zipado (jszip) — CSV não representa
//     bem múltiplas tabelas num arquivo só.
//   - Excel: uma aba por categoria (exceljs), carregado só quando usado
//     (import dinâmico — não engorda o bundle inicial).
//   - PDF (relatório): resumo de contagens + totais financeiros, aberto
//     numa aba nova pra imprimir/salvar como PDF — sem dependência.

const ROTULOS_CATEGORIA = {
  clientes: "Clientes",
  reservas: "Reservas",
  passageiros: "Passageiros",
  viagens: "Viagens",
  veiculos: "Veículos",
  motoristas: "Motoristas",
  combustivel: "Combustível",
  manutencoes: "Manutenções",
  pagamentos: "Pagamentos",
  financeiro: "Financeiro",
  pontos_rota: "Pontos de rota",
  precos_bairro: "Preços por bairro",
  configuracoes: "Configurações",
  usuarios: "Usuários",
  logs: "Logs",
};
const CHAVES_META = new Set(["success", "gerado_em", "versao"]);

/** Só as chaves que são listas de registros (ignora success/gerado_em/versao). */
function categoriasTabulares(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([chave, valor]) => !CHAVES_META.has(chave) && Array.isArray(valor)),
  );
}

/** jsonb/array aninhado vira texto — célula de planilha não guarda objeto. */
function valorCelula(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function nomeArquivo(prefixo, extensao) {
  const agora = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefixo}-${agora}.${extensao}`;
}

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Serializa uma lista de objetos (mesma tabela) em CSV — sem dependência. */
function paraCSV(linhas) {
  if (!linhas || linhas.length === 0) return "";
  const colunas = Array.from(
    linhas.reduce((set, linha) => {
      for (const k of Object.keys(linha)) set.add(k);
      return set;
    }, new Set()),
  );
  const escapar = (v) => {
    const s = String(valorCelula(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecalho = colunas.map(escapar).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => escapar(linha[c])).join(",")).join("\n");
  return `${cabecalho}\n${corpo}`;
}

export function baixarJSON(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  baixarBlob(blob, nomeArquivo("backup-gestao-aritur", "json"));
}

export async function baixarCSVZip(payload) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const categorias = categoriasTabulares(payload);
  for (const [chave, linhas] of Object.entries(categorias)) {
    zip.file(`${chave}.csv`, paraCSV(linhas));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  baixarBlob(blob, nomeArquivo("backup-gestao-aritur-csv", "zip"));
}

export async function baixarExcel(payload) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gestão AriTur";
  workbook.created = new Date(payload.gerado_em || Date.now());

  const categorias = categoriasTabulares(payload);
  for (const [chave, linhas] of Object.entries(categorias)) {
    // nome de aba: só até 31 chars, sem caracteres que o Excel proíbe
    const nomeAba = (ROTULOS_CATEGORIA[chave] || chave).slice(0, 31);
    const planilha = workbook.addWorksheet(nomeAba);
    if (linhas.length === 0) {
      planilha.addRow(["(sem registros)"]);
      continue;
    }
    const colunas = Array.from(
      linhas.reduce((set, linha) => {
        for (const k of Object.keys(linha)) set.add(k);
        return set;
      }, new Set()),
    );
    planilha.columns = colunas.map((c) => ({ header: c, key: c, width: 18 }));
    planilha.getRow(1).font = { bold: true };
    for (const linha of linhas) {
      const linhaPlana = {};
      for (const c of colunas) linhaPlana[c] = valorCelula(linha[c]);
      planilha.addRow(linhaPlana);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nomeArquivo("backup-gestao-aritur", "xlsx"),
  );
}

/** Relatório resumido (contagens + totais financeiros) — abre pra imprimir/salvar em PDF. */
export function abrirRelatorioPDF(payload) {
  const categorias = categoriasTabulares(payload);
  const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const financeiro = categorias.financeiro || [];
  const receita = financeiro
    .filter((f) => f.type === "receita")
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const despesa = financeiro
    .filter((f) => f.type === "despesa")
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);

  const linhas = Object.entries(categorias)
    .map(
      ([chave, lista]) =>
        `<tr><td>${ROTULOS_CATEGORIA[chave] || chave}</td><td style="text-align:right">${lista.length}</td></tr>`,
    )
    .join("");

  const geradoEm = payload.gerado_em
    ? new Date(payload.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de backup — Gestão AriTur</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #16191a; }
  h1 { font-size: 19px; margin-bottom: 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { border-collapse: collapse; width: 100%; max-width: 460px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
  th { background: #f2f2f2; text-align: left; }
  .totais { margin-top: 24px; font-size: 14px; }
  .totais p { margin: 4px 0; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>Gestão AriTur — Relatório de backup</h1>
  <div class="sub">Gerado em ${geradoEm} (São Luís, MA)</div>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:right">Registros</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="totais">
    <p><b>Receita total registrada:</b> ${fmtBRL(receita)}</p>
    <p><b>Despesa total registrada:</b> ${fmtBRL(despesa)}</p>
    <p><b>Saldo:</b> ${fmtBRL(receita - despesa)}</p>
  </div>
</body></html>`;

  const janela = window.open("", "_blank");
  if (!janela) {
    throw new Error(
      "O navegador bloqueou a janela do relatório. Permita pop-ups para este site e tente de novo.",
    );
  }
  janela.document.write(html);
  janela.document.close();
  setTimeout(() => janela.print(), 400);
}
