import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Frota (pedido do dono, 2026-09-20): adicionar/remover veículo, editar
// manutenção, tipo de manutenção como catálogo e comparativo da frota.

const DOIS_VEICULOS = [
  { id: "veh-1", name: "Ônibus 1", plate: "ABC-1234", type: "onibus", capacity: 31, is_default: true, active: true },
  { id: "veh-2", name: "Ônibus 2", plate: "DEF-5678", type: "onibus", capacity: 28, is_default: false, active: true },
];

async function abrirOperacao(page) {
  await expect(page.getByRole("button", { name: /^Dashboard$/ }).first()).toBeVisible();
  const operacao = page.getByRole("button", { name: /^Operação$/ });
  if ((await operacao.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Operação$/ }).first().click();
}

test("Frota: cria um veículo novo", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirOperacao(page);

  await page.getByRole("button", { name: "Novo veículo" }).click();
  await page.getByPlaceholder("Nome (ex.: Ônibus 2)").fill("Van extra");
  await page.getByPlaceholder("Placa").fill("XYZ-9999");
  await page.getByPlaceholder("Capacidade (lugares)").fill("15");
  await page.getByRole("button", { name: "Criar veículo" }).click();

  await expect(page.getByRole("button", { name: /Van extra/ })).toBeVisible();
});

test("Frota: não deixa remover o veículo padrão, mas remove os outros", async ({ page }) => {
  await mockSupabase(page, { role: "admin", vehicles: DOIS_VEICULOS });
  await page.goto("/");
  await abrirOperacao(page);

  await expect(page.getByRole("button", { name: /Ônibus 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ônibus 2/ })).toBeVisible();

  // só o veículo não-padrão tem botão de remover (Ônibus 1 é o padrão)
  await expect(page.getByTitle("Remover veículo")).toHaveCount(1);

  page.once("dialog", (d) => d.accept());
  await page.getByTitle("Remover veículo").click();
  await expect(page.getByRole("button", { name: /Ônibus 2/ })).toHaveCount(0);
});

test("Frota: edita um registro de manutenção existente", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    maintenance: [
      {
        id: "maint-1",
        vehicle_id: "veh-1",
        type: "Troca de óleo",
        performed_at: "2026-09-01",
        odometer_km: 1000,
        interval_km: 5000,
        cost: 200,
        deleted_at: null,
      },
    ],
  });
  await page.goto("/");
  await abrirOperacao(page);

  await expect(page.getByText(/Troca de óleo.*última em/)).toBeVisible();
  await page.getByRole("button", { name: "Editar manutenção: Troca de óleo" }).click();
  await page.getByLabel("Custo da manutenção").fill("350");
  await page.getByRole("button", { name: "Salvar manutenção" }).click();

  await expect(page.getByText(/R\$\s*350,00/)).toBeVisible();
});

test("Frota: cria um tipo de manutenção novo e usa no registro", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirOperacao(page);

  await page.getByLabel("Tipo de manutenção").selectOption("__novo__");
  await page.getByPlaceholder("Nome do novo tipo").fill("Alinhamento");
  await page.getByRole("button", { name: "Criar e usar" }).click();

  await expect(page.getByLabel("Tipo de manutenção")).toHaveValue("Alinhamento");
});

test("Frota: comparativo da frota mostra uma linha por veículo", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    vehicles: DOIS_VEICULOS,
    maintenance: [
      {
        id: "maint-1",
        vehicle_id: "veh-2",
        type: "Revisão geral",
        performed_at: new Date().toISOString().slice(0, 10),
        odometer_km: 2000,
        interval_km: 10000,
        cost: 350,
        deleted_at: null,
      },
    ],
  });
  await page.goto("/");
  await abrirOperacao(page);

  await expect(page.getByText("Comparativo da frota")).toBeVisible();
  const tabela = page.getByText("Comparativo da frota").locator("..");
  await expect(tabela.getByText("Ônibus 1")).toBeVisible();
  await expect(tabela.getByText("Ônibus 2")).toBeVisible();
});
