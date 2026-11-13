import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Lançar por foto (issues #362 e #369): a foto da nota vai para a Edge Function
// `ler-documento` (aqui simulada), o formulário volta preenchido e a pessoa
// confere antes de lançar. Nada é lançado sem o toque em "Lançar".

// PNG 1x1 válido (o app reduz a foto num canvas antes de mandar)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function simularLeitura(page, leitura) {
  const chamadas = { leitura: [], lancamentos: [], marcados: [], abastecimentos: [] };
  await page.route("**/functions/v1/ler-documento", async (route) => {
    chamadas.leitura.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true, id: "doc-1", leitura } });
  });
  await page.route("**/rest/v1/financial_entries*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    chamadas.lancamentos.push(body);
    await route.fulfill({ json: { id: "fe-novo", ...body } });
  });
  await page.route("**/rest/v1/fuel_records*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    chamadas.abastecimentos.push(body);
    await route.fulfill({ json: { id: "fuel-novo", ...body } });
  });
  await page.route("**/rest/v1/documentos_lidos*", async (route) => {
    chamadas.marcados.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 204, body: "" });
  });
  return chamadas;
}

test("Financeiro: foto da nota preenche a despesa e só lança depois de conferir", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const chamadas = await simularLeitura(page, {
    tipo: "despesa",
    legivel: true,
    data: "2026-11-10",
    valor: 89.9,
    fornecedor: "Pedágio BR-135",
    descricao: "Pedágio",
    categoria: "outro",
    observacao: null,
  });
  await page.goto("/");
  await abrirTela(page, "financeiro");

  await page.getByTestId("foto-da-nota").first().setInputFiles({ name: "nota.png", mimeType: "image/png", buffer: PNG });
  const conferir = page.getByTestId("conferir-nota");
  await expect(conferir).toBeVisible();
  expect(chamadas.leitura[0].media_type).toBe("image/jpeg");
  expect(chamadas.leitura[0].tipo).toBe("despesa");
  expect(chamadas.lancamentos).toHaveLength(0); // nada lançado sem conferir

  await expect(conferir.getByLabel("Valor (R$)")).toHaveValue("89.9");
  await expect(conferir.getByLabel("Data")).toHaveValue("2026-11-10");
  await expect(conferir.getByLabel("Descrição")).toHaveValue("Pedágio · Pedágio BR-135");
  await conferir.getByLabel("Valor (R$)").fill("90,50");
  await conferir.getByRole("button", { name: "Lançar" }).click();

  await expect.poll(() => chamadas.lancamentos.length).toBe(1);
  expect(chamadas.lancamentos[0]).toMatchObject({
    entry_date: "2026-11-10",
    type: "despesa",
    category: "outro",
    amount: 90.5,
    description: "Pedágio · Pedágio BR-135",
  });
  await expect.poll(() => chamadas.marcados.length).toBe(1);
  expect(chamadas.marcados[0].body).toMatchObject({ status: "lancado", financial_entry_id: "fe-novo" });
  await expect(page.getByText("Despesa lançada.")).toBeVisible();
  await expect(conferir).toHaveCount(0);
});

test("Operação: cupom de diesel vira abastecimento e pede os km rodados", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const chamadas = await simularLeitura(page, {
    tipo: "abastecimento",
    legivel: true,
    data: "2026-11-11",
    valor: 600,
    litros: 100,
    fornecedor: "Posto Carone",
    descricao: "Diesel S10",
    categoria: "combustivel",
    placa: null,
  });
  await page.goto("/");
  await abrirTela(page, "operacao");

  await page.getByTestId("foto-da-nota").first().setInputFiles({ name: "diesel.png", mimeType: "image/png", buffer: PNG });
  const conferir = page.getByTestId("conferir-nota");
  await expect(conferir.getByLabel("Litros")).toHaveValue("100");
  await conferir.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByText(/Informe quantos km/)).toBeVisible(); // km é da pessoa, a nota não traz
  expect(chamadas.abastecimentos).toHaveLength(0);

  await conferir.getByLabel("Km rodados desde o último").fill("420");
  await conferir.getByRole("button", { name: "Lançar" }).click();
  await expect.poll(() => chamadas.abastecimentos.length).toBe(1);
  expect(chamadas.abastecimentos[0]).toMatchObject({ record_date: "2026-11-11", km: 420, liters: 100, cost: 600 });
  await expect(page.getByText(/Abastecimento lançado/)).toBeVisible();
});

test("descartar não lança nada e marca a leitura como descartada", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const chamadas = await simularLeitura(page, { tipo: "despesa", legivel: false, valor: null });
  await page.goto("/");
  await abrirTela(page, "financeiro");
  await page.getByTestId("foto-da-nota").first().setInputFiles({ name: "x.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/Não deu para ler tudo/)).toBeVisible();
  await page.getByTestId("conferir-nota").getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByTestId("conferir-nota")).toHaveCount(0);
  await expect.poll(() => chamadas.marcados[0]?.body?.status).toBe("descartado");
  expect(chamadas.lancamentos).toHaveLength(0);
});
