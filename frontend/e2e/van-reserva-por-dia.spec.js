import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Van reserva por DIA (issue #408): na Operação, tocar no veículo pede o dia e o sentido; só
// aquela viagem muda de lugares (ônibus 31, van 15). A Agenda mostra as vagas da viagem.

const VEICULOS = [
  {
    id: "veh-1",
    name: "Ônibus principal",
    plate: "PIR-2A10",
    type: "onibus",
    capacity: 31,
    is_default: true,
    active: true,
  },
  {
    id: "veh-2",
    name: "Van reserva",
    plate: "PIR-7B44",
    type: "van",
    capacity: 15,
    is_default: false,
    active: true,
  },
];

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const amanha = () => {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

test("Operação: a van reserva vai só no dia e sentido escolhidos, e volta ao ônibus", async ({
  page,
}) => {
  const trocas = [];
  await mockSupabase(page, {
    role: "admin",
    vehicles: VEICULOS,
    onTrocarVeiculo: (b) => trocas.push(b),
  });
  await page.goto("/");
  await abrirTela(page, "operacao");

  // tocar no veículo não troca o padrão: abre "Usar em: dia + sentido"
  await page.getByRole("button", { name: "Usar Van reserva num dia" }).click();
  const painel = page.getByTestId("escalar-veiculo");
  await expect(painel).toContainText("Usar Van reserva (15 lugares) em:");
  await painel.getByLabel("Dia da viagem").fill(amanha());
  await painel.getByRole("button", { name: "Ida", exact: true }).click();
  await painel.getByRole("button", { name: "Usar neste dia" }).click();

  await expect.poll(() => trocas.length).toBe(1);
  expect(trocas[0]).toEqual({ p_trip_date: amanha(), p_direction: "ida", p_vehicle_id: "veh-2" });
  await expect(painel.getByRole("status")).toContainText("Van reserva");
  // o padrão continua o ônibus
  await expect(page.getByRole("button", { name: "Tornar padrão" })).toHaveCount(1);

  const lista = page.getByTestId("viagens-fora-do-padrao");
  await expect(lista).toContainText("Ida · Van reserva (15 lugares)");
  await lista.getByRole("button", { name: "Voltar ao Ônibus principal" }).click();
  await expect.poll(() => trocas.length).toBe(2);
  expect(trocas[1]).toEqual({ p_trip_date: amanha(), p_direction: "ida", p_vehicle_id: "veh-1" });
  await expect(page.getByTestId("viagens-fora-do-padrao")).toHaveCount(0);
});

test("Operação: viagem com mais passageiros do que a van leva não troca e avisa", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    vehicles: VEICULOS,
    occupancy: { [`${amanha()}|volta`]: { capacity: 31, occupied: 20, available: 11 } },
  });
  await page.goto("/");
  await abrirTela(page, "operacao");

  await page.getByRole("button", { name: "Usar Van reserva num dia" }).click();
  const painel = page.getByTestId("escalar-veiculo");
  await painel.getByLabel("Dia da viagem").fill(amanha());
  await painel.getByRole("button", { name: "Volta", exact: true }).click();
  await painel.getByRole("button", { name: "Usar neste dia" }).click();

  await expect(painel.getByRole("alert")).toContainText(
    "já tem 20 passageiros e Van reserva leva 15",
  );
  await expect(page.getByTestId("viagens-fora-do-padrao")).toHaveCount(0);
});

test("Agenda: as vagas são as da viagem do dia (van 15 na Ida, ônibus 31 na Volta)", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    vehicles: VEICULOS,
    occupancy: {},
    trips: [
      {
        id: "t-ida",
        trip_date: hoje(),
        direction: "ida",
        vehicle_id: "veh-2",
        capacity: 15,
        status: "agendada",
      },
      {
        id: "t-volta",
        trip_date: hoje(),
        direction: "volta",
        vehicle_id: "veh-1",
        capacity: 31,
        status: "agendada",
      },
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const seletor = page.getByTestId("seletor-sentido");
  await expect(seletor.getByRole("tab", { name: /Ida/ })).toContainText("0/15");
  await expect(seletor.getByRole("tab", { name: /Volta/ })).toContainText("0/31");
});
