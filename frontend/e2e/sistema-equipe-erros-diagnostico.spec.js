import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Sistema (pedido do dono, 2026-09-20): redefinir senha de um usuário
// existente, resolver uma entrada do log de erros, e um achado de
// diagnóstico com data de viagem ganha um link pra Agenda.

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
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

test("Sistema: limpar todos os erros (com confirmação) esvazia a lista (issue #264)", async ({
  page,
}) => {
  const limpezas = [];
  const erro = (id, message) => ({
    id,
    at: new Date().toISOString(),
    user_id: null,
    message,
    code: "57014",
    context: {},
    url: null,
    resolved_at: null,
  });
  await mockSupabase(page, {
    role: "admin",
    errorLog: [
      erro("err-a", "list: statement timeout A"),
      erro("err-b", "list: statement timeout B"),
    ],
  });
  page.on("request", (r) => {
    if (
      r.method() === "PATCH" &&
      r.url().includes("/rest/v1/app_error_log") &&
      !r.url().includes("id=eq.")
    ) {
      limpezas.push(r.url());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("list: statement timeout A")).toBeVisible();
  await page.getByRole("button", { name: "Limpar todos" }).click();
  // primeiro toque só pede confirmação: nada foi limpo ainda
  await expect(page.getByText(/ficam guardados no histórico/)).toBeVisible();
  expect(limpezas).toHaveLength(0);
  await page.getByRole("button", { name: "Confirmar: limpar todos" }).click();

  await expect.poll(() => limpezas.length).toBe(1);
  expect(limpezas[0]).toContain("resolved_at=is.null");
  await expect(page.getByText("list: statement timeout A")).toHaveCount(0);
  await expect(page.getByText("list: statement timeout B")).toHaveCount(0);
  await expect(page.getByText(/Nenhum erro registrado/)).toBeVisible();
});

test("Sistema: cancelar a limpeza mantém os erros", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    errorLog: [
      {
        id: "err-c",
        at: new Date().toISOString(),
        user_id: null,
        message: "Erro que deve ficar",
        code: "500",
        context: {},
        url: null,
        resolved_at: null,
      },
    ],
  });
  await page.goto("/");
  await abrirSistema(page);
  await page.getByRole("button", { name: "Limpar todos" }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Erro que deve ficar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Limpar todos" })).toBeVisible();
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
