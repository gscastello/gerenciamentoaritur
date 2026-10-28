import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #216: o banco recusa a passagem quando o mesmo contato já tem reserva
// ativa na viagem; a tela pergunta se é de propósito e só então reenvia com
// extra_data.permitir_duplicada.

async function abrirAgendar(page, onCreate) {
  await mockSupabase(page, { role: "admin", duplicada: true, onCreate });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await page.getByLabel("Telefone (ou nome)").fill("98999990001");
}

const agendar = (page) => page.locator("div.anim-pop").getByRole("button", { name: /^Agendar$/ });

test("duplicada: avisa e, confirmando, reenvia com permitir_duplicada", async ({ page }) => {
  const corpos = [];
  await abrirAgendar(page, (route) => corpos.push(route.request().postDataJSON()));
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await agendar(page).click();

  await expect.poll(() => corpos.length).toBe(2);
  expect(mensagem).toContain("já tem reserva nesta viagem");
  expect(mensagem).toContain("Criar outra reserva mesmo assim?");
  expect(corpos[0].p_extra_data.permitir_duplicada).toBeUndefined();
  expect(corpos[1].p_extra_data.permitir_duplicada).toBe(true);
});

test("duplicada: recusando a confirmação, nada é criado e o aviso fica na tela", async ({
  page,
}) => {
  const corpos = [];
  await abrirAgendar(page, (route) => corpos.push(route.request().postDataJSON()));
  page.once("dialog", (d) => d.dismiss());
  await agendar(page).click();

  await expect(page.getByText(/já tem reserva nesta viagem/)).toBeVisible();
  expect(corpos).toHaveLength(1);
});

test("duplicada: anotação rápida também pergunta antes de criar a segunda", async ({ page }) => {
  const corpos = [];
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    duplicada: true,
    onCreate: (route) => corpos.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  page.once("dialog", (d) => d.accept());
  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("1P Cohatrac 98999998888");
  await campo.press("Enter");

  await expect.poll(() => corpos.length).toBe(2);
  expect(corpos[1].p_extra_data.permitir_duplicada).toBe(true);
  expect(corpos[1].p_extra_data.origem).toBe("anotacao_agenda");
});
