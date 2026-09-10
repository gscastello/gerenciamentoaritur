import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Edição de reserva numa transação só (rpc_edit_reservation, database/33).

test("Agenda: editar reserva salva numa chamada e fecha o modal", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-edit-1",
        data: hoje,
        direcao: "volta",
        pontoId: "pirapemas",
        nome: "Passageiro Edição",
        telefone: "98991234567",
        quantidade: 1,
        valorUnit: 60,
        valorTotal: 60,
        pagamento: "dinheiro",
        status: "confirmada",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        desembarque: "Centro",
        criadoEm: new Date().toISOString(),
      },
    ],
  });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_edit_reservation")) chamadas.push(r.postDataJSON?.());
  });

  await page.goto("/");
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();
  await page.getByRole("button", { name: "Editar" }).first().click();

  await expect(page.getByText("Editar reserva")).toBeVisible();
  await page.getByLabel("Local de desembarque").fill("Cohab Anil, rua 3");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByText("Editar reserva")).toHaveCount(0);
  // uma única chamada atômica, com o novo desembarque
  expect(chamadas.length).toBe(1);
  expect(chamadas[0].p_details.dropoff_location).toBe("Cohab Anil, rua 3");
});
