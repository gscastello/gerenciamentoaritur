import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #239: tabela de trechos em Sistema e preços que o bot sugere, com aprovação do dono.

const SUGESTOES = [
  {
    id: "s-1",
    tipo: "bairro",
    origem: "Maiobinha",
    destino: null,
    price: 80,
    fonte: "reservas",
    evidence_count: 5,
    last_seen_at: new Date().toISOString(),
  },
];
const TRECHOS = [{ id: "t-1", origem: "Pirapemas", destino: "Miranda", price: 30 }];

async function abrirSistema(page, rpc) {
  await mockSupabase(page, { role: "admin" });
  await page.route("**/rest/v1/route_fares*", (route) =>
    route.fulfill({ json: TRECHOS, status: 200 }),
  );
  await page.route("**/rest/v1/bot_price_suggestions*", (route) =>
    route.fulfill({ json: SUGESTOES, status: 200 }),
  );
  await page.route("**/rest/v1/rpc/rpc_revisar_sugestao_de_preco", (route) => {
    rpc.revisar = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, status: "aprovada" }, status: 200 });
  });
  await page.route("**/rest/v1/rpc/rpc_upsert_route_fare", (route) => {
    rpc.salvar = route.request().postDataJSON();
    return route.fulfill({ json: { success: true }, status: 200 });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) await page.getByRole("button", { name: "Mais" }).click();
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Preços por trecho")).toBeVisible();
}

test("aprova o preço que o bot sugeriu, podendo corrigir o valor", async ({ page }) => {
  const rpc = {};
  await abrirSistema(page, rpc);
  await expect(page.getByText(/^Busca em casa em Maiobinha: R\$\s80,00$/)).toBeVisible();
  await expect(page.getByText("usado nas reservas da equipe · 5 vezes")).toBeVisible();

  await page.getByLabel(/^Valor de Busca em casa em Maiobinha/).fill("85");
  await page.getByRole("button", { name: /^Aprovar Busca em casa em Maiobinha/ }).click();
  await expect.poll(() => rpc.revisar).toEqual({ p_id: "s-1", p_aprovar: true, p_price: 85 });
});

test("recusa a sugestão sem mandar valor", async ({ page }) => {
  const rpc = {};
  await abrirSistema(page, rpc);
  await page.getByRole("button", { name: /^Recusar Busca em casa em Maiobinha/ }).click();
  await expect.poll(() => rpc.revisar).toEqual({ p_id: "s-1", p_aprovar: false, p_price: null });
});

test("mostra e adiciona trecho", async ({ page }) => {
  const rpc = {};
  await abrirSistema(page, rpc);
  await expect(page.getByText("Pirapemas ⇄ Miranda")).toBeVisible();

  await page.getByLabel("De", { exact: true }).fill("Cantanhede");
  await page.getByLabel("Até", { exact: true }).fill("Matões");
  await page.locator("#trecho-preco").fill("35");
  await page.getByRole("button", { name: "Adicionar trecho" }).click();
  await expect
    .poll(() => rpc.salvar)
    .toEqual({ p_origem: "Cantanhede", p_destino: "Matões", p_price: 35 });
});
