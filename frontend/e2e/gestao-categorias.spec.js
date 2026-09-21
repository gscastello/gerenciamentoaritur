import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Reforma da tela de Gestão (pedido do dono, 2026-09-20): categorias de
// custo ganham aba própria "Categorias", com criação pros dois tipos
// (Gestão e Caixa do dia); o card "Resultado" perde o card duplicado e
// passa a ter os grupos expansíveis.

// no mobile a barra inferior só mostra os primeiros itens + "Mais"; no
// desktop a sidebar mostra tudo — mesmo padrão de reserva.spec.js.
async function abrirGestao(page) {
  await expect(page.getByRole("button", { name: /^Dashboard$/ }).first()).toBeVisible();
  const gestao = page.getByRole("button", { name: /^Gestão$/ });
  if ((await gestao.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await gestao.first().click();
}

test("Gestão: cria categoria de custo empresarial pela aba Categorias", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirGestao(page);
  await page.getByRole("button", { name: "Categorias" }).click();

  const cardGestao = page.getByText("Custos empresariais (Gestão)", { exact: true }).locator("..");
  await cardGestao.getByPlaceholder("Ex.: Aluguel do galpão").fill("Pedágio");
  await cardGestao.getByRole("button", { name: "Criar" }).click();

  await expect(cardGestao.getByText("Pedágio", { exact: true })).toBeVisible();
});

test("Gestão: cria categoria de Caixa do dia e ela aparece no Financeiro", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirGestao(page);
  await page.getByRole("button", { name: "Categorias" }).click();

  const cardDespesa = page.getByText("Caixa do dia (Financeiro)", { exact: true }).locator("..");
  await cardDespesa.getByPlaceholder("Ex.: Aluguel do galpão").fill("Pedágio de viagem");
  await cardDespesa.getByRole("button", { name: "Criar" }).click();
  await expect(cardDespesa.getByText("Pedágio de viagem", { exact: true })).toBeVisible();

  const financeiro = page.getByRole("button", { name: /^Financeiro$/ });
  if ((await financeiro.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await financeiro.first().click();
  await expect(page.getByRole("button", { name: /Pedágio de viagem/ })).toBeVisible();
});

test("Gestão: Resultado — grupo do DRE expande e recolhe a lista de categorias", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirGestao(page);

  await expect(page.getByText("Demonstrativo do mês")).toBeVisible();
  await expect(page.getByText("Custos empresariais por categoria")).toHaveCount(0);

  await page.getByText("Veículo", { exact: true }).click();
  await expect(page.getByText("Lavagem", { exact: true })).toBeVisible();

  await page.getByText("Veículo", { exact: true }).click();
  await expect(page.getByText("Lavagem", { exact: true })).toHaveCount(0);
});

// Pedido do dono (2026-09-21): "custos de operação" misturava combustível,
// diárias de motorista e manutenção numa linha só do DRE — agora cada um
// vira sua própria linha.
test("Gestão: Resultado — combustível, motorista e manutenção aparecem em linhas separadas", async ({
  page,
}) => {
  const hoje = new Date();
  const ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  await mockSupabase(page, {
    role: "admin",
    financialEntries: [
      { id: "e1", entry_date: `${ym}-05`, type: "receita", category: "passagem", amount: 10000 },
      { id: "e2", entry_date: `${ym}-05`, type: "despesa", category: "combustivel", amount: 800 },
      { id: "e3", entry_date: `${ym}-06`, type: "despesa", category: "motorista", amount: 300 },
      { id: "e4", entry_date: `${ym}-07`, type: "despesa", category: "manutencao", amount: 500 },
    ],
  });
  await page.goto("/");
  await abrirGestao(page);

  await expect(page.getByText("Combustível", { exact: true })).toBeVisible();
  await expect(page.getByText("− R$ 800,00")).toBeVisible();
  await expect(page.getByText("Diárias de motorista(s)", { exact: true })).toBeVisible();
  await expect(page.getByText("− R$ 300,00")).toBeVisible();
  await expect(page.getByText("Manutenção", { exact: true })).toBeVisible();
  await expect(page.getByText("− R$ 500,00")).toBeVisible();
  await expect(page.getByText(/Custos de operação/)).toHaveCount(0);
});
