import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #234: cartão como forma de pagamento.

test("nova reserva: agenda pagando com cartão", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    onCreate: (route) => {
      corpo = route.request().postDataJSON();
    },
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();

  const modal = page.locator("div.anim-pop");
  await modal.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await modal.getByLabel("Telefone (ou nome)").fill("98999990001");
  await modal.getByLabel("Pagamento").selectOption({ label: "Cartão" });
  await modal.getByRole("button", { name: /^Agendar$/ }).click();

  await expect.poll(() => corpo?.p_payment_method).toBe("cartao");
});
