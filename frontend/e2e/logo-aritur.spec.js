import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Logo oficial (issue #391, artes enviadas pelo dono em 13/11): no login, a logo para fundo
// escuro (já traz o slogan); no topo de cada tela do celular, o AT direto no fundo, sem o
// selo branco; na lateral do computador, a logo inteira.

test("login mostra a logo oficial para fundo escuro, carregada", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByAltText(/AriTur Transportes/);
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", "/brand/logo-fundo-escuro.webp");
  await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test("a logo aparece em todas as telas, sem fundo branco", async ({ page, isMobile }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  const conferir = async () => {
    if (isMobile) {
      const at = page.getByTestId("logo-aritur").filter({ visible: true }).first();
      await expect(at).toBeVisible();
      await expect(at).toHaveAttribute("src", "/brand/emblema-at.webp");
      expect(await at.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        "rgba(0, 0, 0, 0)",
      );
      await expect.poll(() => at.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    } else {
      const logo = page
        .getByAltText(/AriTur Transportes/)
        .filter({ visible: true })
        .first();
      await expect(logo).toHaveAttribute("src", "/brand/logo-fundo-escuro.webp");
      await expect.poll(() => logo.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
  };
  await conferir(); // Agenda
  for (const tela of ["atendimento", "financeiro", "operacao"]) {
    await abrirTela(page, tela);
    await conferir();
  }
});
