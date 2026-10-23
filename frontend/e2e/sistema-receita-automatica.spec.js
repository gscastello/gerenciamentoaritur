import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #204: a receita automática das passagens no Financeiro fica
// PAUSADA (database/58) e dá para religar/pausar em Sistema.

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Receita automática das passagens")).toBeVisible();
}

test("Sistema mostra a receita automática PAUSADA e explica o que isso significa", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("Pausada", { exact: true })).toBeVisible();
  await expect(page.getByText(/não.*lança receita no Financeiro/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Religar receita automática" })).toBeVisible();
});

test("religar pede confirmação e grava auto_revenue.enabled = true", async ({ page }) => {
  const gravacoes = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await page.getByRole("button", { name: "Religar receita automática" }).click();

  expect(mensagem).toContain("NÃO são lançadas retroativamente");
  await expect
    .poll(() => gravacoes.find((g) => g?.key === "auto_revenue")?.value?.enabled)
    .toBe(true);
});

test("cancelar a confirmação mantém a receita pausada", async ({ page }) => {
  let gravou = false;
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) gravou = true;
  });
  await page.goto("/");
  await abrirSistema(page);

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Religar receita automática" }).click();
  expect(gravou).toBe(false);
  await expect(page.getByText("Pausada", { exact: true })).toBeVisible();
});
