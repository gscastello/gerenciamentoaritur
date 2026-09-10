import { expect, test } from "@playwright/test";

// Smoke da fundação. O app agora é fechado por login (Supabase Auth), então
// sem sessão o que carrega é a tela de login. Os fluxos autenticados
// (Agenda, Reservar, etc.) precisam de um projeto Supabase de teste —
// entram na issue #4 (testing).

test("carrega a tela de login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Gestão AriTur")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("a tela de login tem os campos de e-mail e senha", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("a tela de login tem o vídeo do ônibus AriTur de fundo", async ({ page }) => {
  await page.goto("/");
  const video = page.locator("video[src='/media/aritur-hero.mp4']");
  await expect(video).toHaveCount(1);
  // o mp4 é servido (não 404) — dá pra pegar a resposta
  const resp = await page.request.get("/media/aritur-hero.mp4");
  expect(resp.ok()).toBe(true);
  expect(Number(resp.headers()["content-length"] || "0")).toBeLessThan(2_000_000);
});
