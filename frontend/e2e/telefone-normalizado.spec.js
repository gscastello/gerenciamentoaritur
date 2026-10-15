import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Auditoria de reservas (pedido do dono, 2026-10-01): da última vez o app
// "não reconheceu" um número colado do WhatsApp — a causa real não era a
// validação (já tolerava pontuação/marcas invisíveis), e sim que 7 dos 9
// campos de telefone mandavam pro backend o texto CRU digitado/colado em
// vez do valor normalizado por validarTelefone(). O mesmo número digitado
// uma vez ("98999998888") e colado outra vez com a formatação do WhatsApp
// ("+55 (98) 99999-8888") virava dois clientes diferentes no banco — gate
// de regressão: o payload que sai do frontend pras RPCs tem que estar
// sempre no mesmo formato (DDD + 8/9 dígitos, sem +55), não importa como
// foi digitado.

test("Agenda: Agendar passagem manual também normaliza o telefone antes de enviar", async ({
  page,
}) => {
  let createBody = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      createBody = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();

  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await expect(page.getByText("Agendar passagem")).toBeVisible();

  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await page.getByLabel("Nome *").fill("Cliente Manual E2E");
  await page.getByLabel("Telefone *").fill("+55 98 99999-8888");

  await page.getByRole("button", { name: /^Agendar$/ }).first().click();

  await expect.poll(() => createBody?.p_customer_phone, { timeout: 10000 }).toBe("98999998888");
});
