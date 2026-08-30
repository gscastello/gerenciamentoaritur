import { expect, test } from "@playwright/test";

// Smoke da fundação. Os fluxos completos de cliente/motorista entram na
// issue #4 (testing).

test("o app carrega e mostra a navegação principal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rota Pirapemas")).toBeVisible();
  await expect(page.getByRole("button", { name: /Agenda/ })).toBeVisible();
});

test("skeleton some e o conteúdo da aba aparece", async ({ page }) => {
  await page.goto("/");
  // A aba inicial ("Reservar") renderiza um cabeçalho depois do skeleton.
  await expect(page.getByText(/Atendimento automático/i)).toBeVisible({ timeout: 10_000 });
});

test("navegar para Agenda troca o conteúdo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Agenda/ }).first().click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
});
