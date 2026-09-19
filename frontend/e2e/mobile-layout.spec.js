import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Regressão (2026-09-19): no celular, os campos de formulário tinham
// fonte de 14px — abaixo dos 16px que o Safari/iOS exige pra não dar
// zoom sozinho ao focar — e TODO botão levava min-height:42px, inclusive
// ícone pequeno (26px de largura virava um retângulo de 26×42 em vez de
// um quadrado). Estes testes seguram essas duas correções.

test.use({ viewport: { width: 390, height: 844 } });

test("campo de formulário tem fonte >= 16px no celular (evita zoom automático do Safari)", async ({
  page,
}) => {
  await page.goto("/");
  const email = page.locator('input[type="email"]');
  await expect(email).toBeVisible();
  const fontSize = await email.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test("botão de ícone pequeno não fica esticado no celular (mesma largura e altura)", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();

  const sair = page.getByRole("button", { name: "Sair da conta" }).first();
  const box = await sair.boundingBox();
  expect(box).not.toBeNull();
  // tolerância pequena — o ponto é não ter uma altura de 42px numa caixa
  // de ~28px de largura (era 28×42 antes da correção).
  expect(Math.abs(box.width - box.height)).toBeLessThan(6);
});
