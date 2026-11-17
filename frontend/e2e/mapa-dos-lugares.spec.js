import { expect, test } from "@playwright/test";
import { escolherSentido, irParaODia } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #430: na Agenda, o mapa dos lugares do veículo do dia no lugar da barra de lotação —
// ônibus de 31 (2 na frente, fileiras de 2 + corredor + 2, fundo com 5) e van de 15 (2 + corredor
// + 1, fundo com 3). Confirmados acesos, pendentes riscados, livres vazios.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const VEICULOS = [
  {
    id: "veh-1",
    name: "Ônibus",
    plate: "ABC-1234",
    type: "onibus",
    capacity: 31,
    is_default: true,
    active: true,
  },
  {
    id: "veh-2",
    name: "Van reserva",
    plate: "XYZ-9876",
    type: "van",
    capacity: 15,
    is_default: false,
    active: true,
  },
];
const res = (id, campos) => ({
  id,
  data: hoje,
  quantidade: 1,
  valorUnit: 80,
  valorTotal: 80,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
  nome: `Passageiro ${id}`,
  telefone: "98999990000",
  ...campos,
});

test("Agenda: mapa dos lugares do ônibus (31) na Ida e da van (15) na Volta", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    vehicles: VEICULOS,
    occupancy: {},
    trips: [
      {
        id: "t-volta",
        trip_date: hoje,
        direction: "volta",
        vehicle_id: "veh-2",
        capacity: 15,
        status: "agendada",
      },
    ],
    reservations: [
      res("i1", { direcao: "ida", pontoId: "rodoviaria", quantidade: 4 }),
      res("i2", { direcao: "ida", pontoId: "retorno", quantidade: 2, status: "pendente" }),
      res("v1", { direcao: "volta", pontoId: "pirapemas", embarque: "Rua do Sol", quantidade: 3 }),
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await irParaODia(page, hoje);

  await escolherSentido(page, "Ida");
  const ida = page.getByTestId("mapa-lugares-ida");
  await expect(ida).toHaveAttribute(
    "aria-label",
    "4 de 31 lugares ocupados, 2 pendentes, 25 livres",
  );
  await expect(ida.locator("[data-lugar]")).toHaveCount(31);
  await expect(ida.locator('[data-lugar="confirmado"]')).toHaveCount(4);
  await expect(ida.locator('[data-lugar="pendente"]')).toHaveCount(2);
  // ônibus: 8 fileiras (2 na frente, 6 de 2+2, o fundo com 5)
  const fileirasIda = ida.locator(":scope > div:first-child > div");
  await expect(fileirasIda).toHaveCount(8);
  await expect(fileirasIda.first().locator("[data-lugar]")).toHaveCount(2);
  await expect(fileirasIda.last().locator("[data-lugar]")).toHaveCount(5);
  await expect(page.getByTestId("lotacao-ida")).toContainText(
    "2 pendentes · 0 embarcados · 0 pagos",
  );

  await escolherSentido(page, "Volta");
  const volta = page.getByTestId("mapa-lugares-volta");
  await expect(volta).toHaveAttribute(
    "aria-label",
    "3 de 15 lugares ocupados, 0 pendentes, 12 livres",
  );
  await expect(volta.locator("[data-lugar]")).toHaveCount(15);
  // van: 5 fileiras (4 de 2+1 e o fundo com 3)
  const fileirasVolta = volta.locator(":scope > div:first-child > div");
  await expect(fileirasVolta).toHaveCount(5);
  await expect(fileirasVolta.first().locator("[data-lugar]")).toHaveCount(3);
  await expect(fileirasVolta.last().locator("[data-lugar]")).toHaveCount(3);
});
