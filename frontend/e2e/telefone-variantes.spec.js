import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #236: o cadastro tem de ser reconhecido com qualquer variação do telefone.

async function abrirNovaReserva(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  return page.locator("div.anim-pop");
}

test("telefone sem DDD e sem o nono dígito encontra o cadastro e vai normalizado", async ({
  page,
}) => {
  const consultas = [];
  let corpo = null;
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith("/rest/v1/customers")) consultas.push(url.searchParams.get("or"));
  });
  await mockSupabase(page, {
    role: "admin",
    customers: [{ id: "c1", name: "Maria Silva", phone: "9881012388" }],
    onCreate: (route) => {
      corpo = route.request().postDataJSON();
    },
  });

  const modal = await abrirNovaReserva(page);
  await modal.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await modal.getByLabel("Telefone (ou nome)", { exact: true }).fill("8101 2388");

  await expect(modal.getByTestId("cadastro-encontrado")).toContainText("Maria Silva");
  expect(consultas.at(-1)).toContain("9881012388,98981012388");

  await modal.getByRole("button", { name: /^Agendar$/ }).click();
  await expect.poll(() => corpo?.p_customer_phone).toBe("9881012388");
});

test("telefone que não está no cadastro não mostra aviso", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customers: [] });
  const modal = await abrirNovaReserva(page);
  await modal.getByLabel("Telefone (ou nome)", { exact: true }).fill("98 99999-0001");
  await page.waitForTimeout(400);
  await expect(modal.getByTestId("cadastro-encontrado")).toHaveCount(0);
});
