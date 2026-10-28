import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #214: reserva "leve" — passagem só com o telefone OU só com o nome;
// o resto se completa depois, editando a reserva.

async function abrirAgendar(page, onCreate) {
  await mockSupabase(page, { role: "admin", onCreate });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
}

const agendar = (page) => page.locator("div.anim-pop").getByRole("button", { name: /^Agendar$/ });

test("só com o telefone: envia sem nome", async ({ page }) => {
  let corpo = null;
  await abrirAgendar(page, (route) => {
    corpo = route.request().postDataJSON();
  });
  await expect(agendar(page)).toBeDisabled();
  await page.getByLabel("Telefone (ou nome)").fill("98999990001");
  await expect(agendar(page)).toBeEnabled();
  await agendar(page).click();
  await expect.poll(() => corpo?.p_customer_phone).toBe("98999990001");
  expect(corpo.p_customer_name).toBe("");
});

test("só com o nome: envia sem telefone", async ({ page }) => {
  let corpo = null;
  await abrirAgendar(page, (route) => {
    corpo = route.request().postDataJSON();
  });
  await page.getByLabel("Nome (ou telefone)").fill("Maria Só Nome");
  await expect(agendar(page)).toBeEnabled();
  await agendar(page).click();
  await expect.poll(() => corpo?.p_customer_name).toBe("Maria Só Nome");
  expect(corpo.p_customer_phone).toBeNull();
});

test("telefone preenchido mas inválido ainda barra o envio", async ({ page }) => {
  await abrirAgendar(page);
  await page.getByLabel("Telefone (ou nome)").fill("123");
  await agendar(page).click();
  await expect(page.getByText(/DDD/)).toBeVisible();
});
