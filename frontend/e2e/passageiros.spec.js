import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// CRM paginado no servidor (v_customers_stats, database/37).

const STATS = Array.from({ length: 3 }, (_, i) => ({
  customer_id: `c${i}`,
  nome: `Passageiro ${i}`,
  telefone: `9899000000${i}`,
  notes: "",
  bairro_padrao: null,
  viagens_count: 5 - i,
  total_passagens: 6 - i,
  cancelamentos: 0,
  nao_compareceu: 0,
  total_gasto: `${(3 - i) * 100}.00`,
  ultima_data: "2026-09-10",
  reservas_total: 5 - i,
}));

test("Passageiros: lista do servidor, busca e abre o detalhe", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();

  await expect(page.getByText("3 passageiros")).toBeVisible();
  await expect(page.getByText("Passageiro 0")).toBeVisible();

  // busca no servidor
  await page.getByPlaceholder("Buscar por nome ou telefone…").fill("Passageiro 1");
  await expect(page.getByText("Passageiro 1")).toBeVisible();

  // abre o detalhe (carrega o histórico sob demanda)
  await page.getByRole("button", { name: /Passageiro 1/ }).click();
  await expect(page.getByText("Notas do CRM")).toBeVisible();
});
