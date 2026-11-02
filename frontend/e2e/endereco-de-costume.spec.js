import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Agendamento rápido com o endereço de costume do passageiro recorrente (#228).

const STATS = [
  {
    customer_id: "c0",
    nome: "Maria Recorrente",
    telefone: "98990000000",
    notes: "",
    bairro_padrao: null,
    viagens_count: 6,
    total_passagens: 6,
    cancelamentos: 0,
    nao_compareceu: 0,
    total_gasto: "480.00",
    ultima_data: "2026-09-10",
    reservas_total: 6,
    pagamento_padrao: "pix",
  },
];

const COSTUMES = {
  c0: {
    sentido_sugerido: "ida",
    ida: {
      fonte: "historico",
      vezes: 4,
      route_point_code: "busca",
      route_point_name: "Buscar em Casa",
      neighborhood: "Cohama",
      detail: "Quadra 3, casa 12",
      dropoff_location: "Pirapemas centro",
      dropoff_area: null,
    },
    volta: null,
  },
};

async function abrirPassageiro(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();
  await page.getByRole("button", { name: /^MR Maria Recorrente/ }).click();
  await expect(page.getByText("Endereço de costume", { exact: true })).toBeVisible();
}

test("Passageiros: agenda a Ida com o endereço de costume já preenchido", async ({ page }) => {
  const criadas = [];
  await mockSupabase(page, {
    role: "admin",
    customersStats: STATS,
    costumes: COSTUMES,
    onCreate: (route) => criadas.push(route.request().postDataJSON()),
  });
  await abrirPassageiro(page);

  const ida = page.getByTestId("costume-ida");
  await expect(ida).toContainText("Buscar em Casa · Cohama, Quadra 3, casa 12 → Pirapemas centro");
  await expect(ida).toContainText("4× no histórico");
  await expect(ida).toContainText("sugerida agora");
  await expect(page.getByTestId("costume-volta")).toContainText("sem endereço de costume");

  await ida.getByRole("button", { name: "Agendar Ida" }).click();

  // modal da nova reserva, já com o costume
  await expect(page.getByTestId("aviso-costume")).toContainText("Endereço de costume (4× no histórico)");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();

  await expect.poll(() => criadas.length).toBe(1);
  expect(criadas[0]).toMatchObject({
    p_direction: "ida",
    p_customer_name: "Maria Recorrente",
    p_customer_phone: "98990000000",
    p_route_point_code: "busca",
    p_pickup_neighborhood: "Cohama",
    p_pickup_detail: "Quadra 3, casa 12",
    p_dropoff_location: "Pirapemas centro",
    p_payment_method: "pix",
    p_quantity: 1,
    p_unit_price: 80,
  });
  expect(criadas[0].p_trip_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("Passageiros: a equipe fixa o endereço de costume da Volta e depois solta", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS, costumes: COSTUMES });
  await abrirPassageiro(page);

  const volta = page.getByTestId("costume-volta");
  await volta.getByRole("button", { name: "Fixar endereço" }).click();
  await volta.getByLabel("Rua / referência").fill("Rua do Sol, 45");
  await volta.getByLabel("Desembarque").fill("Rodoviária de São Luís");
  await volta.getByRole("button", { name: "Fixar endereço" }).click();

  await expect(volta).toContainText("Rua do Sol, 45");
  await expect(volta).toContainText("fixado pela equipe");

  await volta.getByRole("button", { name: "Soltar" }).click();
  await expect(volta).toContainText("sem endereço de costume");
});

test("Passageiros: fixa como costume o que veio do histórico", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS, costumes: COSTUMES });
  await abrirPassageiro(page);

  const ida = page.getByTestId("costume-ida");
  await ida.getByRole("button", { name: "Fixar", exact: true }).click();
  await expect(ida).toContainText("fixado pela equipe");
  await expect(ida).toContainText("Cohama");
});
