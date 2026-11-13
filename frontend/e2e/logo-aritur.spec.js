import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #385 (dono, 13/11): a logo da AriTur sempre presente. No topo de cada tela o
// monograma vai num selo branco (o T preto some no fundo escuro); no login, a logo
// com brilho, feita para fundo escuro.

test("login mostra a logo com brilho, carregada", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByAltText(/AriTur Transportes/);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", "/brand/logo-brilho.webp");
  expect(await logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test("a logo aparece no topo em todas as telas, num selo branco", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  const conferir = async () => {
    const selo = page.getByTestId("logo-aritur").filter({ visible: true }).first();
    await expect(selo).toBeVisible();
    expect(await selo.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(255, 255, 255)",
    );
    const img = selo.getByRole("img", { name: "AriTur" });
    await expect(img).toBeVisible();
    expect(await img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  };
  await conferir(); // Agenda
  for (const tela of ["atendimento", "financeiro", "operacao"]) {
    await abrirTela(page, tela);
    await conferir();
  }
});
