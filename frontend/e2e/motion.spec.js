import { expect, test } from "@playwright/test";

// Cobre os itens do checklist de motion (AGENTS.md §5) que dá para
// verificar de fora.

test("mostra skeleton antes do conteúdo da aba", async ({ page }) => {
  await page.goto("/");
  // O skeleton marca aria-busy; o conteúdo real chega depois.
  const busy = page.locator('[aria-busy="true"]');
  await expect(busy.first()).toBeVisible();
  await expect(page.getByText(/Atendimento automático/i)).toBeVisible({ timeout: 10_000 });
  await expect(busy).toHaveCount(0);
});

test("navegar entre abas troca o conteúdo com o skeleton no meio", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Atendimento automático/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Dashboard/ }).first().click();
  // A aba pesada (Dashboard/Recharts) passa pelo skeleton antes de montar.
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10_000 });
});

test("prefers-reduced-motion desliga as transições longas", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText(/Atendimento automático/i)).toBeVisible({ timeout: 10_000 });

  // Com reduced-motion, elementos animados não devem ter animação ativa.
  const anyAnimating = await page.evaluate(() => {
    return [...document.querySelectorAll("*")].some((el) => {
      const d = getComputedStyle(el).animationDuration;
      return d && d !== "0s" && Number.parseFloat(d) > 0.05;
    });
  });
  expect(anyAnimating).toBe(false);
  await context.close();
});
