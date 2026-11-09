import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #263: embarque DENTRO do aeroporto (categoria Outros) custa R$ 70; o
// "retorno do aeroporto" é o ponto Retorno e nunca pega esse preço.

async function novaReservaEmOutros(page, local) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Outros" });
  await page.getByLabel("Nome (ou telefone)").fill("Cliente Aeroporto Teste");
  await page.getByLabel("Telefone (ou nome)").fill("98999990000");
  await page.getByLabel(/Anotação/).fill(local);
}

test("Nova reserva em Outros no aeroporto usa o preço próprio (R$ 70)", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await novaReservaEmOutros(page, "Aeroporto de São Luís");
  await expect(page.getByText(/auto: R\$\s*70,00/)).toBeVisible();
  await page.getByRole("button", { name: /^Agendar$/ }).click();
  await expect.poll(() => corpo?.p_unit_price).toBe(70);
  expect(corpo.p_route_point_code).toBe("outro");
  expect(corpo.p_pickup_detail).toBe("Aeroporto de São Luís");
});

test("'Retorno do aeroporto' em Outros não pega o preço do aeroporto", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await novaReservaEmOutros(page, "Retorno do aeroporto");
  await page.getByRole("button", { name: /^Agendar$/ }).click();
  await expect.poll(() => corpo?.p_unit_price).toBe(60);
});

test("Anotação rápida na caixinha de Outros: aeroporto sai a R$ 70", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  const campo = page.getByLabel("Anotar reserva — Outros");
  await campo.fill("1P Aeroporto 98999998888");
  await campo.press("Enter");
  await expect.poll(() => corpo?.p_unit_price).toBe(70);
  expect(corpo.p_route_point_code).toBe("outro");
});

test("Sistema: o admin vê e cadastra locais de Outros com preço próprio", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_upsert_boarding_spot_price")) chamadas.push(r.postDataJSON());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  const aba = page.getByRole("button", { name: /^Sistema$/ });
  if ((await aba.count()) === 0) await page.getByRole("button", { name: "Mais" }).click();
  await page
    .getByRole("button", { name: /^Sistema$/ })
    .first()
    .click();
  await expect(page.getByText("Locais em Outros com preço próprio")).toBeVisible();
  await expect(page.getByText("Aeroporto", { exact: true })).toBeVisible();
  await page.getByLabel("Local", { exact: true }).fill("Aeroporto");
  await page.getByLabel("Valor (R$)").last().fill("75");
  await page.getByRole("button", { name: "Adicionar local com preço" }).click();
  await expect.poll(() => chamadas[0]).toEqual({ p_local: "Aeroporto", p_price: 75 });
});
