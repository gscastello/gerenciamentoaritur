import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Cadastro do cliente totalmente editável em Passageiros (pedido do dono,
// 2026-09-20): nome, telefone e as preferências fixas (ponto de embarque
// e pagamento padrão — database/44) usadas depois pela Central de
// Atendimento como sugestão prioritária sobre o histórico.

const STATS = [
  {
    customer_id: "c0",
    nome: "Maria Receptora",
    telefone: "98988887777",
    notes: "",
    bairro_padrao: null,
    ponto_padrao: null,
    pagamento_padrao: null,
    viagens_count: 4,
    total_passagens: 4,
    cancelamentos: 0,
    nao_compareceu: 0,
    total_gasto: "320.00",
    ultima_data: "2026-09-10",
    reservas_total: 4,
  },
];

test("Passageiros: edita nome, telefone e preferências fixas do cliente", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();

  await expect(page.getByText("Maria Receptora")).toBeVisible();
  await page.getByRole("button", { name: "Editar cadastro de Maria Receptora" }).click();

  await expect(page.getByText("Editar cadastro")).toBeVisible();
  await page.getByLabel("Nome").fill("Maria Silva");
  await page.getByLabel("Telefone").fill("98999997777");
  await page
    .getByLabel("Ponto de embarque padrão (opcional)")
    .selectOption({ label: "Rodoviária" });
  await page.getByLabel("Pagamento padrão (opcional)").selectOption("pix");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText("Editar cadastro")).toHaveCount(0);
  await expect(page.getByText("Maria Silva")).toBeVisible();
  await expect(page.getByText(/Ponto padrão:.*Rodoviária/)).toBeVisible();
  await expect(page.getByText(/Pagamento padrão:.*Pix/)).toBeVisible();
});

test("Passageiros: telefone inválido barra o salvamento do cadastro", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();

  await page.getByRole("button", { name: "Editar cadastro de Maria Receptora" }).click();
  await page.getByLabel("Telefone").fill("123");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText(/DDD/i)).toBeVisible();
  await expect(page.getByText("Editar cadastro")).toBeVisible();
});
