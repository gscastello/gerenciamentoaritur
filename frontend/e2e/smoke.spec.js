import { expect, test } from "@playwright/test";

// Smoke da fundação. O app agora é fechado por login (Supabase Auth), então
// sem sessão o que carrega é a tela de login. Os fluxos autenticados
// (Agenda, Reservar, etc.) precisam de um projeto Supabase de teste —
// entram na issue #4 (testing).

test("carrega a tela de login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rota Pirapemas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("a tela de login tem os campos de e-mail e senha", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
