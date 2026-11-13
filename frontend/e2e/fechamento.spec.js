import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Fechamento do mês (issue #365): abre no mês anterior com o resultado e baixa o
// PDF, a planilha e as fotos das notas num .zip.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function mesAnterior() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date(),
  );
  const [a, m] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

test("Fechamento: resultado do mês anterior e downloads para o contador", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const mes = mesAnterior();
  const pedidos = [];
  await page.route("**/rest/v1/rpc/rpc_fechamento_do_mes", async (route) => {
    const { p_mes } = route.request().postDataJSON();
    pedidos.push(p_mes);
    return route.fulfill({
      json: {
        mes: p_mes,
        gerado_em: new Date().toISOString(),
        numeros: {
          lancamentos: {
            receita: 10000,
            despesa: 6000,
            margem_pct: 40,
            despesa_por_categoria: { combustivel: 4000, outro: 2000 },
            receita_por_categoria: { passagem: 10000 },
          },
          reservas: {
            passageiros: 140,
            ticket_medio: 70,
            cobertura_da_receita_pct: 98,
            por_sentido: { ida: { viagens: 2, passageiros: 70, valor: 4900, ticket_medio: 70 } },
            por_forma_de_pagamento: { dinheiro: 4900 },
          },
          viagens: { lista: [] },
          a_receber: { total: 0 },
        },
        lancamentos: [
          {
            data: `${p_mes}-03`,
            tipo: "despesa",
            categoria: "combustivel",
            valor: 4000,
            descricao: "Diesel",
            nota: "notas/a.jpg",
          },
          {
            data: `${p_mes}-04`,
            tipo: "despesa",
            categoria: "outro",
            valor: 2000,
            descricao: "Peças",
            nota: null,
          },
        ],
        pagamentos: [],
        contas_quitadas: [],
      },
    });
  });
  await page.route("**/rest/v1/financial_entries*", async (route) => {
    if (route.request().url().includes("type=eq.receita")) return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.route("**/storage/v1/object/sign/notas/**", (route) =>
    route.fulfill({ json: { signedURL: "/object/sign/notas/notas/a.jpg?token=t" } }),
  );
  await page.route("**/storage/v1/object/sign/notas/notas/a.jpg?token=t", (route) =>
    route.fulfill({ body: PNG, contentType: "image/jpeg" }),
  );

  await page.goto("/");
  await abrirTela(page, "fechamento");
  await expect(page.getByLabel("Mês do fechamento")).toHaveValue(mes);
  const resultado = page.getByTestId("resultado-do-mes");
  await expect(resultado).toContainText("Resultado antes do imposto");
  await expect(resultado).toContainText(/R\$\s*4\.000,00/);
  await expect(page.getByTestId("avisos-do-fechamento")).toContainText(
    "1 despesa(s) sem foto da nota.",
  );
  expect(pedidos[0]).toBe(mes);

  const [planilha] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("baixar-planilha").click(),
  ]);
  expect(planilha.suggestedFilename()).toBe(`fechamento-${mes}.xlsx`);

  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("baixar-fotos").click(),
  ]);
  expect(zip.suggestedFilename()).toBe(`notas-${mes}.zip`);
  await expect(page.getByText("1 foto(s) no .zip.")).toBeVisible();

  const [pdf] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByTestId("baixar-pdf").click(),
  ]);
  await expect(pdf.locator("h1")).toContainText("Fechamento de");
});
