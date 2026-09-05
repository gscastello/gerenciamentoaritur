import { expect, test } from "@playwright/test";

// Sem sessão, o que renderiza é a tela de login. O que dá para verificar
// de fora aqui é a regra inegociável do AGENTS.md §5: com
// prefers-reduced-motion, nada anima. Os testes de skeleton/lazy por aba
// precisam de um usuário autenticado — entram na issue #4.

test("prefers-reduced-motion desliga as animações", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Gestão AriTur")).toBeVisible();

  const anyAnimating = await page.evaluate(() =>
    [...document.querySelectorAll("*")].some((el) => {
      const d = getComputedStyle(el).animationDuration;
      return d && d !== "0s" && Number.parseFloat(d) > 0.05;
    }),
  );
  expect(anyAnimating).toBe(false);
  await context.close();
});
