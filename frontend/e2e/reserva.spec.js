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

// Regressão: a aba Sistema (só admin) precisa abrir sem quebrar. O PR #83
// referenciou <SistemaCidades /> sem a definição do componente e nenhum
// teste abria a aba como admin — o app quebrava só em produção.
test("admin abre a aba Sistema e as telas de configuração renderizam", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");

  // espera o app sair do login e montar a navegação
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();

  // no mobile a barra inferior só mostra 4 itens + "Mais"; no desktop a
  // sidebar mostra tudo
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await sistema.click();

  await expect(page.getByText("Cidades da rota")).toBeVisible();
  await expect(page.getByText("Cidades atendidas")).toBeVisible();
  await expect(page.getByText("Cidades intermediárias")).toBeVisible();
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

test("Reservar: desembarque em cidade intermediária → reserva pendente (issue #6)", async ({
  page,
}) => {
  let createBody = null;
  await mockSupabase(page, {
    role: "atendente",
    occupancy: {},
    createResult: { success: true, reservation_id: "e2e-pend-1", status: "pendente", message: "created" },
    onCreate: (route) => {
      createBody = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill("2026-09-15");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Ida ·/ }).click();
  await page.getByRole("button", { name: /Rodoviária/ }).click();

  await expect(page.getByText("Dados da reserva")).toBeVisible();
  await page.getByLabel("Onde você vai ficar (desembarque)").selectOption("outro");
  await page.getByRole("textbox", { name: "Onde você vai ficar *" }).fill("perto do posto em Bacabeira");
  await page.getByLabel("Nome completo").fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");

  // a UI já avisa que vai ficar pendente
  await expect(page.getByText(/fora da nossa área padrão|ficará\s+pendente/i)).toBeVisible();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Dinheiro" }).click();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect
    .poll(() => createBody?.p_status, { timeout: 10000 })
    .toBe("pendente");
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
