import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #353 (dono, 12/11): o app abre na Agenda; Atendimento no lugar do Bloco de
// notas na barra do celular; atalhos de Assistente e Pendências em todas as telas.

test("o app abre na Agenda", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Agenda" }).first()).toBeVisible();
});

test("barra do celular: Atendimento no lugar do Bloco de notas", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "barra de baixo só existe no celular");
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  const barra = page.locator("div.fixed.bottom-0");
  await expect(barra.getByRole("button", { name: /Atendimento/ })).toBeVisible();
  await expect(barra.getByRole("button", { name: /Bloco de notas/ })).toHaveCount(0);
  // o Bloco continua em "Mais"
  await barra.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("button", { name: /Bloco de notas/ }).first()).toBeVisible();
});

test("ações rápidas levam ao Assistente e às Pendências", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  const fab = page.getByRole("button", { name: "Ações rápidas", exact: true });
  await fab.click();
  await fab
    .locator("..")
    .getByRole("button", { name: /^Pendências/ })
    .click();
  await expect(page.getByRole("heading", { name: /Pendências/ }).first()).toBeVisible();
  await fab.click();
  await fab.locator("..").getByRole("button", { name: "Assistente" }).click();
  await expect(page.getByRole("heading", { name: /Assistente/ }).first()).toBeVisible();
});

test("puxar para baixo no topo atualiza e volta na mesma aba", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "gesto de toque só no celular");
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Lista do Dia/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /Lista/ }).first()).toBeVisible();
  const recarregou = page.waitForEvent("load");
  await page.evaluate(() => {
    const alvo = document.querySelector("main") ?? document.body;
    const toque = (y) => new Touch({ identifier: 1, target: alvo, clientX: 180, clientY: y });
    const evento = (tipo, y) =>
      new TouchEvent(tipo, {
        bubbles: true,
        touches: tipo === "touchend" ? [] : [toque(y)],
        changedTouches: [toque(y)],
      });
    alvo.dispatchEvent(evento("touchstart", 120));
    alvo.dispatchEvent(evento("touchmove", 220));
    alvo.dispatchEvent(evento("touchmove", 320));
    alvo.dispatchEvent(evento("touchend", 320));
  });
  await recarregou;
  await expect(page.getByRole("heading", { name: /Lista/ }).first()).toBeVisible();
});

test("puxão curto não atualiza", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "gesto de toque só no celular");
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Agenda" }).first()).toBeVisible();
  let recarregou = false;
  page.on("load", () => {
    recarregou = true;
  });
  await page.evaluate(() => {
    const alvo = document.querySelector("main") ?? document.body;
    const toque = (y) => new Touch({ identifier: 1, target: alvo, clientX: 180, clientY: y });
    const evento = (tipo, y) =>
      new TouchEvent(tipo, {
        bubbles: true,
        touches: tipo === "touchend" ? [] : [toque(y)],
        changedTouches: [toque(y)],
      });
    alvo.dispatchEvent(evento("touchstart", 120));
    alvo.dispatchEvent(evento("touchmove", 160));
    alvo.dispatchEvent(evento("touchend", 160));
  });
  await page.waitForTimeout(800);
  expect(recarregou).toBe(false);
});
