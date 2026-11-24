import { expect, test } from "@playwright/test";
import { abrirMenu } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Login de demonstração (issue #510): quem entra com ele vê o aviso e não é chamado a agir; o admin cria
// o login em Equipe. A trava de verdade é do banco (database/134).

test("Demonstração: o aviso fica na tela e a pergunta do veículo não aparece", async ({ page }) => {
  await mockSupabase(page, { role: "admin", somenteLeitura: true });
  await page.goto("/");
  await expect(page.getByTestId("login-de-demonstracao")).toContainText("nada é gravado");
  await expect(page.getByTestId("confirmar-veiculo")).toHaveCount(0);
});

test("Demonstração: login comum não vê o aviso", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();
  await expect(page.getByTestId("login-de-demonstracao")).toHaveCount(0);
});

test("Equipe: criar login de demonstração manda admin em só leitura", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const pedidos = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/functions/v1/create-user")) {
      pedidos.push(r.postDataJSON());
    }
  });
  await page.goto("/");
  await abrirMenu(page, "Sistema");
  await page
    .getByRole("button", { name: /Equipe/ })
    .first()
    .click();
  await page.getByPlaceholder("e-mail").fill("auditor@exemplo.com");
  await page.getByPlaceholder("nome", { exact: true }).fill("Auditor");
  await page.locator("select", { hasText: "Demonstração" }).selectOption("demonstracao");
  await page.getByPlaceholder("senha temporária").fill("somente-teste-e2e");
  await page.getByRole("button", { name: "Criar login" }).click();
  await expect(page.getByText(/Login criado para auditor@exemplo.com/)).toBeVisible();
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0]).toMatchObject({ role: "admin", somenteLeitura: true });
});
