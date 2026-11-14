import { expect, test } from "@playwright/test";
import { escolherSentido } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #237: na Volta, quem desce em cidade que não é parada fixa ganha destaque.

const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const base = {
  data: hoje,
  direcao: "volta",
  pontoId: "pirapemas",
  telefone: "98991234567",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
};
const reservations = [
  { ...base, id: "r-1", nome: "Desce no Meio", desembarque: "Entroncamento" },
  { ...base, id: "r-2", nome: "Vai até o Fim", desembarque: "Cohama" },
];

for (const aba of ["Agenda", "Rota"]) {
  test(`${aba}: destaca só a reserva que desce em cidade intermediária`, async ({ page }) => {
    await mockSupabase(page, { role: "admin", occupancy: {}, reservations });
    await page.goto("/");
    await page
      .getByRole("button", { name: new RegExp(`^${aba}$`) })
      .first()
      .click();
    await page.locator('input[type="date"]').first().fill(hoje);
    if (aba === "Agenda") await escolherSentido(page, "Volta");

    const selos = page.getByTestId("selo-cidade-intermediaria");
    await expect(selos).toHaveCount(1);
    await expect(selos).toHaveText("Desce em Entroncamento");
    await expect(page.getByText("Vai até o Fim").first()).toBeVisible();
  });
}
