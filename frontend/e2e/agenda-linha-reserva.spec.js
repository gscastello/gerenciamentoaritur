import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #185: na Agenda, reservas de ponto fixo (Rodoviária / Retorno /
// Posto Carone) mostram só o nome do passageiro — sem repetir o nome do
// ponto na frente — e toda reserva mostra o telefone de contato.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const base = {
  data: hoje,
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

test("Agenda: ponto fixo mostra só o nome do passageiro e o telefone", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        ...base,
        id: "res-rod",
        direcao: "ida",
        pontoId: "rodoviaria",
        nome: "Maria da Rodoviária Teste",
        telefone: "98991234567",
      },
      {
        ...base,
        id: "res-busca",
        direcao: "ida",
        pontoId: "busca",
        bairro: "Cohatrac",
        nome: "João do Bairro Teste",
        telefone: "98987654321",
      },
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje);

  // o nome do passageiro aparece com destaque e o telefone é um link de ligação
  const nomeRod = page.getByText("Maria da Rodoviária Teste", { exact: true });
  await expect(nomeRod).toBeVisible();
  expect(
    await nomeRod.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole("link", { name: /98991234567/ })).toBeVisible();

  // na linha do ponto fixo NÃO repete "Rodoviária" ao lado do nome (o título da seção já diz)
  const linhaRod = page.locator("div.row-hover", { hasText: "Maria da Rodoviária Teste" });
  await expect(linhaRod.getByText(/^Rodoviária$/)).toHaveCount(0);

  // ponto de busca continua mostrando o bairro (é a informação útil)
  const linhaBusca = page.locator("div.row-hover", { hasText: "João do Bairro Teste" });
  await expect(linhaBusca).toContainText("Cohatrac");
  await expect(page.getByRole("link", { name: /98987654321/ })).toBeVisible();
});
