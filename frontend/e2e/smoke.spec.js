import { expect, test } from "@playwright/test";

// Smoke da fundação. O app agora é fechado por login (Supabase Auth), então
// sem sessão o que carrega é a tela de login. Os fluxos autenticados
// (Agenda, Atendimento, etc.) precisam de um projeto Supabase de teste —
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

test("a tela de login tem a opção de permanecer conectado, marcada por padrão", async ({
  page,
}) => {
  await page.goto("/");
  const checkbox = page.getByRole("checkbox", { name: "Permanecer conectado" });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked();
});

test("viewport trava o zoom do navegador (app fixo, não página de conteúdo)", async ({ page }) => {
  await page.goto("/");
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("maximum-scale=1");
  expect(content).toContain("user-scalable=no");
});

// Crítica de design (issue #393): a foto vertical do ônibus enche o fundo do login.
test("a tela de login tem a foto do ônibus AriTur de fundo", async ({ page }) => {
  await page.goto("/");
  const foto = page.locator("img[src='/brand/login-onibus.webp']");
  await expect(foto).toHaveCount(1);
  await expect.poll(() => foto.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  // o vídeo do fundo do Início continua servido (não 404) e leve
  for (const src of ["/media/aritur-bg.mp4"]) {
    const resp = await page.request.get(src);
    expect(resp.ok()).toBe(true);
    expect(Number(resp.headers()["content-length"] || "0")).toBeLessThan(2_000_000);
  }
});
