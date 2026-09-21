import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Sistema (pedido do dono, 2026-09-20): redefinir senha de um usuário
// existente, resolver uma entrada do log de erros, e um achado de
// diagnóstico com data de viagem ganha um link pra Agenda.

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Equipe e logins")).toBeVisible();
}

test("Sistema: redefine a senha de um usuário da equipe", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirSistema(page);

  await page.getByRole("button", { name: "redefinir senha de Motorista E2E" }).click();
  const celula = page.getByRole("cell", { name: "Nova senha de Motorista E2E:" });
  await celula.getByPlaceholder("senha temporária").fill("novaSenha123");
  await page.getByRole("button", { name: "salvar nova senha" }).click();

  await expect(page.getByText(/Senha de Motorista E2E redefinida/)).toBeVisible();
});

test("Sistema: resolve uma entrada do log de erros e ela some da lista", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    errorLog: [
      {
        id: "err-1",
        at: new Date().toISOString(),
        user_id: null,
        message: "Falha ao carregar relatório",
        code: "500",
        context: {},
        url: null,
        resolved_at: null,
      },
    ],
  });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("Falha ao carregar relatório")).toBeVisible();
  await page.getByRole("button", { name: "Resolver: Falha ao carregar relatório" }).click();

  await expect(page.getByText("Falha ao carregar relatório")).toHaveCount(0);
});

test("Sistema: diagnóstico com data de viagem mostra 'Ver reserva' e navega pra Agenda", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    diagnostico: [
      {
        kind: "sem_telefone",
        reservation_id: "res-1",
        trip_id: "trip-1",
        detail: { customer_id: "c1", customer_name: "Cliente sem telefone" },
        trip_date: "2026-09-25",
      },
    ],
  });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("Reserva ativa sem telefone de contato")).toBeVisible();
  await page.getByRole("button", { name: "Ver reserva" }).click();

  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect(page.locator('input[type="date"]').first()).toHaveValue("2026-09-25");
});
