import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Validação no frontend antes de chamar a RPC (domain/validacao.js).

test("Agendar passagem: telefone inválido barra o envio", async ({ page }) => {
  let criouRpc = false;
  await mockSupabase(page, { role: "admin", occupancy: {} });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_create_reservation")) criouRpc = true;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  // abre "Agendar passagem" pelo botão flutuante
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await expect(page.getByText("Agendar passagem")).toBeVisible();

  await page.getByLabel("Nome").fill("Maria Teste");
  await page.getByLabel("Telefone").fill("123"); // inválido
  // preenche o bairro (ponto "Buscar em Casa" costuma ser o 1º da ida)
  const bairro = page.getByLabel("Bairro");
  if (await bairro.count()) await bairro.fill("Cohama");

  await page.getByRole("button", { name: /^Agendar$/ }).click();

  await expect(page.getByText(/Telefone precisa ter DDD/)).toBeVisible();
  expect(criouRpc).toBe(false);
});
