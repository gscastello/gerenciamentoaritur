import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Extrato do banco (issue #364): enviar o OFX, ver o que bate, o que falta, o que
// está em dobro e o que não tem par; lançar com um toque; reenviar não repete.

const OFX = `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>InfinitePay</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>542<ACCTID>12345678</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>70.00<FITID>A1<MEMO>Pix recebido
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-350.00<FITID>A2<MEMO>POSTO CARONE
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-90.00<FITID>A3<MEMO>OFICINA DO ZE
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function simular(page) {
  const chamadas = { guardados: 0, lancados: [] };
  let linhas = [];
  const lancamentos = [
    {
      id: "e-posto",
      entry_date: "2026-11-06",
      type: "despesa",
      amount: 350,
      category: "combustivel",
      description: "Diesel",
    },
    {
      id: "e-dobro",
      entry_date: "2026-11-07",
      type: "despesa",
      amount: 350,
      category: "combustivel",
      description: "Diesel de novo",
    },
    {
      id: "e-dia",
      entry_date: "2026-11-05",
      type: "receita",
      amount: 1500,
      category: "passagem",
      description: "Caixa do dia",
    },
    {
      id: "e-almoco",
      entry_date: "2026-11-06",
      type: "despesa",
      amount: 40,
      category: "alimentacao",
      description: "Almoço",
    },
  ];
  await page.route("**/rest/v1/extrato_linhas*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const novos = req
        .postDataJSON()
        .filter((r) => !linhas.some((l) => l.chave === r.chave))
        .map((r, i) => ({
          ...r,
          id: `l-${linhas.length + i + 1}`,
          financial_entry_id: null,
          ignorada: false,
        }));
      linhas = [...linhas, ...novos];
      chamadas.guardados += novos.length;
      return route.fulfill({ json: novos.map((n) => ({ id: n.id })) });
    }
    if (req.method() === "PATCH") return route.fulfill({ json: [] });
    const url = req.url();
    if (url.includes("limit=1")) {
      const ultima = [...linhas].sort((a, b) => b.data.localeCompare(a.data))[0];
      return route.fulfill({ json: ultima ? [{ data: ultima.data }] : [] });
    }
    return route.fulfill({ json: linhas });
  });
  await page.route("**/rest/v1/rpc/rpc_lancar_movimento", async (route) => {
    const { p_linha, p_categoria } = route.request().postDataJSON();
    chamadas.lancados.push({ p_linha, p_categoria });
    const l = linhas.find((x) => x.id === p_linha);
    lancamentos.push({
      id: "e-novo",
      entry_date: l.data,
      type: "despesa",
      amount: Math.abs(l.valor),
      category: p_categoria,
      description: `${l.descricao} (extrato)`,
    });
    linhas = linhas.map((x) => (x.id === p_linha ? { ...x, financial_entry_id: "e-novo" } : x));
    return route.fulfill({
      json: { success: true, financial_entry_id: "e-novo", ja_lancado: false },
    });
  });
  await page.route("**/rest/v1/financial_entries*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: lancamentos });
    return route.fallback();
  });
  await page.route("**/rest/v1/payments*", async (route) => {
    if (route.request().url().includes("status=eq.pago")) return route.fulfill({ json: [] });
    return route.fallback();
  });
  return chamadas;
}

const categoria = (slug, label) => ({
  id: `ec-${slug}`,
  slug,
  label,
  grupo: "Caixa do dia",
  kind: "despesa",
  icon: "Receipt",
  sort_order: 10,
  active: true,
});

test("Extrato: envia o OFX, confere, lança o que falta e não repete", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    expenseCategories: [
      categoria("combustivel", "Combustível"),
      categoria("manutencao", "Manutenção"),
      categoria("alimentacao", "Alimentação"),
      categoria("outro", "Outro"),
    ],
  });
  const chamadas = await simular(page);
  await page.goto("/");
  await abrirTela(page, "extrato");
  await expect(page.getByText("Nenhum movimento do banco neste mês.")).toBeVisible();

  const arquivo = { name: "extrato.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(OFX) };
  await page.getByTestId("arquivo-do-extrato").setInputFiles(arquivo);
  await expect(
    page.getByText("3 movimento(s) lido(s) de InfinitePay …5678: 3 novo(s)."),
  ).toBeVisible();
  await expect(page.getByLabel("Mês do extrato")).toHaveValue("2026-11");

  const resumo = page.getByTestId("resumo-do-extrato");
  // posto bate; Pix cabe no caixa do dia; oficina falta
  await expect(resumo).toContainText("Batem2");
  await expect(resumo).toContainText("Falta lançar1");
  await expect(resumo).toContainText("Em dobro no app1");
  await expect(resumo).toContainText("No app, fora do banco1");
  await expect(page.getByTestId("lista-em-dobro")).toContainText("Diesel de novo");
  await expect(page.getByTestId("lista-sem-par")).toContainText("Almoço");

  const falta = page.getByTestId("movimento-falta");
  await expect(falta).toHaveCount(1);
  await expect(falta).toContainText("OFICINA DO ZE");
  await expect(falta.getByLabel("Categoria de OFICINA DO ZE")).toHaveValue("manutencao");
  await falta.getByRole("button", { name: "Lançar" }).click();
  await expect
    .poll(() => chamadas.lancados)
    .toEqual([{ p_linha: "l-3", p_categoria: "manutencao" }]);
  await expect(resumo).toContainText("Batem3");
  await expect(page.getByTestId("movimento-falta")).toHaveCount(0);

  await page.getByTestId("arquivo-do-extrato").setInputFiles(arquivo);
  await expect(
    page.getByText(
      "3 movimento(s) lido(s) de InfinitePay …5678: 0 novo(s), 3 já estava(m) guardado(s).",
    ),
  ).toBeVisible();
  expect(chamadas.guardados).toBe(3);
});
