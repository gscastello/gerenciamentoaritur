import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Bot de WhatsApp na aba Sistema (issue #179): base de conhecimento
// editável (database/50), guia de estilo e o modo "Sombra".

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  // a tela Sistema tem abas (issue #397)
  await page.getByRole("button", { name: "Bot", exact: true }).click();
  await expect(page.getByText("O que o bot sabe sobre a empresa")).toBeVisible();
}

const ITEM = {
  id: "bk-1",
  title: "Bagagem",
  content: "Uma mala grande e uma bolsa de mão por passageiro.",
  active: true,
  sort_order: 100,
  deleted_at: null,
};

test("Sistema > Bot: adiciona um assunto à base de conhecimento", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirSistema(page);

  await page.getByLabel("Assunto").first().fill("Crianças");
  await page
    .getByLabel("O que o bot deve saber")
    .first()
    .fill("Menores de 5 anos viajam no colo, sem custo.");
  await page.getByRole("button", { name: "Adicionar à base" }).click();

  await expect(page.getByText("Crianças", { exact: true })).toBeVisible();
  await expect(page.getByText("Menores de 5 anos viajam no colo, sem custo.")).toBeVisible();
});

test("Sistema > Bot: edita, pausa e remove um assunto", async ({ page }) => {
  await mockSupabase(page, { role: "admin", botKnowledge: [ITEM] });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("Bagagem", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Editar Bagagem" }).click();
  await page.getByLabel("O que o bot deve saber").last().fill("Duas malas por passageiro.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Duas malas por passageiro.")).toBeVisible();

  await page.getByRole("button", { name: "Pausar Bagagem" }).click();
  await expect(page.getByText("pausado")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover Bagagem" }).click();
  await expect(page.getByText("Bagagem", { exact: true })).toHaveCount(0);
});

test("Sistema > Bot: salva o guia de estilo e troca para o modo Sombra", async ({ page }) => {
  const gravacoes = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  await page.getByLabel("Guia de estilo").fill("Trate por você, frases curtas, sem gírias.");
  await page.getByRole("button", { name: "Salvar guia de estilo" }).click();
  await expect
    .poll(() => gravacoes.find((g) => g?.key === "bot_style_guide")?.value?.text)
    .toBe("Trate por você, frases curtas, sem gírias.");

  await page.getByRole("button", { name: /Sombra \(só aprende\)/ }).click();
  await expect
    .poll(() => gravacoes.find((g) => g?.key === "attendance_mode")?.value?.mode)
    .toBe("sombra");
});

test("Sistema > Bot: salva o contato do motorista com o telefone normalizado (#244)", async ({
  page,
}) => {
  const gravacoes = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  const telefone = page.getByLabel("Telefone do motorista");
  await telefone.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nome", { exact: true }).fill("Maurício");
  await telefone.fill("(98) 98101-2388");
  await expect(telefone).toHaveValue("(98) 98101-2388");
  await page.getByRole("button", { name: "Salvar contato" }).click();
  await expect
    .poll(() => gravacoes.find((g) => g?.key === "driver_contact")?.value)
    .toEqual({ name: "Maurício", phone: "98981012388" });
});

test("Sistema > Bot: telefone do motorista inválido não é salvo", async ({ page }) => {
  const gravacoes = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  const telefone = page.getByLabel("Telefone do motorista");
  await telefone.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await telefone.fill("123");
  await page.getByRole("button", { name: "Salvar contato" }).click();
  await expect(page.getByText(/Telefone precisa ter DDD/)).toBeVisible();
  expect(gravacoes.some((g) => g?.key === "driver_contact")).toBe(false);
});
