import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Veículo do dia (issue #502): a faixa pergunta, um toque confirma os dois sentidos e acerta os lugares;
// na Operação, as vendas do bot abrem e fecham por viagem.

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" });
const HOJE = fmt.format(new Date());
const amanha = new Date(`${HOJE}T12:00:00Z`);
amanha.setUTCDate(amanha.getUTCDate() + 1);
const AMANHA = amanha.toISOString().slice(0, 10);

const VEICULOS = [
  {
    id: "v-onibus",
    name: "Ônibus principal",
    capacity: 31,
    is_default: true,
    active: true,
    type: "onibus",
    plate: "A",
  },
  {
    id: "v-van",
    name: "Van + carro",
    capacity: 19,
    is_default: false,
    active: true,
    type: "van",
    plate: "B",
  },
];
const viagem = (id, trip_date, direction) => ({
  id,
  trip_date,
  direction,
  capacity: 31,
  vehicle_id: "v-onibus",
  status: "agendada",
  vehicle_confirmed_at: null,
  sales_closed_at: null,
});
const opcoes = (extra) => ({
  role: "admin",
  vehicles: VEICULOS,
  trips: [
    viagem("t-hoje", HOJE, "volta"),
    viagem("t-ida", AMANHA, "ida"),
    viagem("t-volta", AMANHA, "volta"),
  ],
  ...extra,
});

test("Veículo do dia: um toque confirma a Volta de hoje e a faixa sai", async ({ page }) => {
  await mockSupabase(page, opcoes());
  const pedidos = [];
  page.on("request", (r) => {
    if (r.url().includes("rpc_confirmar_veiculo")) pedidos.push(r.postDataJSON());
  });
  await page.goto("/");
  const faixa = page.getByTestId("confirmar-veiculo");
  await expect(faixa).toContainText("Qual veículo roda hoje");
  await expect(faixa).toContainText("(Volta)");
  await faixa.getByRole("button", { name: /Van \+ carro · 19/ }).click();
  await expect(faixa).toHaveCount(0);
  expect(pedidos.map((p) => [p.p_trip_date, p.p_direction, p.p_vehicle_id])).toEqual([
    [HOJE, "volta", "v-van"],
  ]);
});

test("Veículo do dia: o motorista não vê a pergunta", async ({ page }) => {
  await mockSupabase(page, opcoes({ role: "motorista" }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();
  await expect(page.getByTestId("confirmar-veiculo")).toHaveCount(0);
});

test("Operação: fechar e abrir as vendas do bot de uma viagem", async ({ page }) => {
  await mockSupabase(page, opcoes());
  await page.goto("/");
  await abrirTela(page, "operacao");
  const viagemDeHoje = page.getByTestId("vendas-das-viagens").getByRole("listitem").first();
  await expect(viagemDeHoje).toContainText("Volta");
  await viagemDeHoje.getByRole("button", { name: "Fechar vendas" }).click();
  await expect(viagemDeHoje).toContainText("vendas fechadas");
  await viagemDeHoje.getByRole("button", { name: "Abrir vendas" }).click();
  await expect(viagemDeHoje.getByRole("button", { name: "Fechar vendas" })).toBeVisible();
});
