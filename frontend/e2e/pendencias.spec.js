import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Tela de Pendências (issue #118): fila de atendimentos para a equipe.

test("Pendências: lista, abre manual e resolve", async ({ page }) => {
  await mockSupabase(page, {
    role: "atendente",
    pendencias: [
      {
        id: "tkt-seed",
        source: "whatsapp",
        phone: "5598991234567",
        customer_id: null,
        assunto: "Cliente pediu para falar com atendente",
        detail: "Quer trocar a data mas o bot não entendeu",
        status: "aberta",
        meta: {},
        created_at: new Date(Date.now() - 10 * 60000).toISOString(),
        cliente: "Maria",
        aberto_por: null,
      },
    ],
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  // vai para a aba Pendências (pode estar no menu "Mais" no mobile)
  let aba = page.getByRole("button", { name: "Pendências" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Pendências" });
  }
  await aba.first().click();

  await expect(page.getByText("Cliente pediu para falar com atendente")).toBeVisible();

  // abre uma pendência manual
  await page.getByPlaceholder("Assunto (ex.: ligar de volta)").fill("Ligar para o Sr. José");
  await page.getByRole("button", { name: "Abrir pendência" }).click();
  await expect(page.getByText("Ligar para o Sr. José")).toBeVisible();

  // resolve a nova
  await page
    .locator("div")
    .filter({ hasText: /^Ligar para o Sr\. José/ })
    .getByRole("button", { name: "Resolver" })
    .first()
    .click();
  await expect(page.getByText("Ligar para o Sr. José")).toHaveCount(0);
});
