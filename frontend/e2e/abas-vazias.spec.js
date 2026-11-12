import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Toda aba tem que abrir sem quebrar quando não há reservas/clientes —
// é o estado normal de uma operação nova (ou de um dia parado). Cobre
// especialmente Financeiro/Gestão/Operação, que não tinham nenhum e2e.

const TABS = ["Dashboard", "Agenda", "Lista do Dia", "Bloco de notas", "Passageiros", "Sistema"];
// telas dentro de um grupo do menu (issue #360): abertas pela aba no topo
const TELAS_DE_GRUPO = [
  "financeiro",
  "gestao",
  "operacao",
  "atendimento",
  "para_lancar",
  "pendencias",
  "bot",
];

test("todas as abas abrem sem erro com reservas/clientes vazios (admin)", async ({ page }) => {
  const erros = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });
  page.on("pageerror", (err) => erros.push(String(err)));

  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();

  for (const nome of TABS) {
    let botao = page.getByRole("button", { name: new RegExp(`^${nome}$`) });
    if ((await botao.count()) === 0) {
      await page
        .getByRole("button", { name: "Mais" })
        .click()
        .catch(() => {});
      botao = page.getByRole("button", { name: new RegExp(`^${nome}$`) });
    }
    await expect(botao.first()).toBeVisible({ timeout: 5000 });
    await botao.first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Algo deu errado nesta tela")).toHaveCount(0);
  }
  for (const tela of TELAS_DE_GRUPO) {
    await abrirTela(page, tela);
    await page.waitForTimeout(500);
    await expect(page.getByText("Algo deu errado nesta tela")).toHaveCount(0);
  }

  const relevantes = erros.filter(
    (e) => !/favicon|ResizeObserver|Download the React DevTools|WebSocket|realtime/i.test(e),
  );
  expect(relevantes, `Erros de console encontrados:\n${relevantes.join("\n")}`).toEqual([]);
});

test("as abas do motorista abrem sem erro com reservas/clientes vazios", async ({ page }) => {
  const erros = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });
  page.on("pageerror", (err) => erros.push(String(err)));

  await mockSupabase(page, { role: "motorista" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();

  for (const nome of ["Agenda", "Lista do Dia"]) {
    const botao = page.getByRole("button", { name: new RegExp(`^${nome}$`) });
    await expect(botao.first()).toBeVisible({ timeout: 5000 });
    await botao.first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Algo deu errado nesta tela")).toHaveCount(0);
  }

  const relevantes = erros.filter(
    (e) => !/favicon|ResizeObserver|Download the React DevTools|WebSocket|realtime/i.test(e),
  );
  expect(relevantes, `Erros de console encontrados:\n${relevantes.join("\n")}`).toEqual([]);
});
