import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Fluxos autenticados de Reserva (issue #4). Sem projeto Supabase de teste
// no CI — o helper mockSupabase injeta a sessão e intercepta PostgREST/RPC.

test("app passa da tela de login e mostra a navegação por papel", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");

  // atendente vê Reservar; NÃO vê Sistema (TAB_ROLES em App.jsx)
  await expect(page.getByRole("button", { name: /Reservar/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sistema$/ })).toHaveCount(0);
});

test("Reservar: data → direção com vaga → escolha do ponto de embarque", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", occupancy: {} });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await expect(page.getByText("Para quando é a viagem?")).toBeVisible();
  await page.locator('input[type="date"]').fill("2026-09-15"); // terça
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("O que você precisa?")).toBeVisible();
  await page.getByRole("button", { name: /Ida ·/ }).click();

  await expect(page.getByText("Local de embarque")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rodoviária/ })).toBeVisible();
});

test("Reservar: roteiro do cliente até os dados da reserva", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", occupancy: {} });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill("2026-09-15");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Ida ·/ }).click();
  await page.getByRole("button", { name: /Rodoviária/ }).click();

  // step "Dados da reserva": quantidade default 1, desembarque + contato
  await expect(page.getByText("Dados da reserva")).toBeVisible();
  await page.getByLabel("Onde você vai ficar (desembarque)").selectOption("pirapemas");
  await page.getByLabel("Nome completo").fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");
  // com os campos obrigatórios preenchidos, o botão de avançar habilita
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
});

test("Reservar: viagem lotada → lista de espera → confirmação (RPC com status espera)", async ({
  page,
}) => {
  let createBody = null;
  await mockSupabase(page, {
    role: "atendente",
    // ReservarTab calcula vagas a partir de v_reservations_flat + capacidade
    // do veículo padrão (31). Uma reserva confirmada de 40 lugares lota a Ida.
    reservations: [
      { id: "r-cheia", data: "2026-09-15", direcao: "ida", status: "confirmada", tipo: "passagem", quantidade: 40 },
    ],
    createResult: { success: true, reservation_id: "e2e-espera-1", status: "espera", message: "created" },
    onCreate: (route) => {
      createBody = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill("2026-09-15");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: /Ida.*Lotado/s }).click();
  await expect(page.getByText("Lista de espera", { exact: true })).toBeVisible();

  await page.getByLabel("Nome", { exact: true }).fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");
  await page.getByRole("button", { name: "Entrar na lista de espera" }).click();

  await expect(page.getByText("Você entrou na lista de espera!", { exact: true })).toBeVisible();
  expect(createBody?.p_status).toBe("espera");
});
