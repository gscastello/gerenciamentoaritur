import { expect, test } from "@playwright/test";
import { escolherSentido } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #432: "Avisar passageiros" na Agenda — a mensagem de cada um com o horário do ponto dele;
// nada sai sem o toque em Enviar e na confirmação; quem fica fora das 24 h vai para "Avisar pelo
// celular"; quem já recebeu volta desmarcado.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const res = (id, campos) => ({
  id,
  data: hoje,
  direcao: "ida",
  quantidade: 1,
  valorUnit: 80,
  valorTotal: 80,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
  ...campos,
});

test("Agenda: avisar os passageiros com o horário do ponto de cada um", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    avisoForaDaJanela: ["r2"],
    reservations: [
      res("r1", { pontoId: "rodoviaria", nome: "Maria Teste", telefone: "98999990001" }),
      res("r2", {
        pontoId: "busca",
        bairro: "Cohatrac",
        nome: "Dona joana Teste",
        telefone: "98999990002",
      }),
      res("r3", {
        pontoId: "retorno",
        nome: "Pedro Teste",
        telefone: "98999990003",
        status: "cancelada",
      }),
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje);
  await escolherSentido(page, "Ida");
  await page.getByRole("button", { name: "Avisar passageiros" }).click();

  const janela = page.getByTestId("avisar-passageiros");
  await expect(janela).toBeVisible();
  // cancelada não entra; o tratamento vai junto do nome
  await expect(janela.getByRole("checkbox")).toHaveCount(2);
  await expect(janela.getByText(/Olá, Maria!.*Rodoviária às/)).toBeVisible();
  await expect(janela.getByText(/Olá, Dona Joana!.*buscar em casa a partir das/)).toBeVisible();

  // primeiro toque pede confirmação; só o segundo envia
  await janela.getByRole("button", { name: "Enviar para 2" }).click();
  expect(page.avisosPedidos.length).toBe(0);
  await janela.getByRole("button", { name: "Confirmar: enviar para 2" }).click();
  await expect(page.getByTestId("resultado-do-aviso")).toHaveText(
    "1 enviado · 1 para avisar pelo celular",
  );
  expect(page.avisosPedidos[0].map((i) => i.reservation_id).sort()).toEqual(["r1", "r2"]);
  expect(page.avisosPedidos[0].find((i) => i.reservation_id === "r1").ponto).toBe("Rodoviária");

  // fora das 24 h: na lista do celular; quem recebeu volta desmarcado, quem não recebeu continua marcado
  const celular = page.getByTestId("avisar-pelo-celular");
  await expect(celular).toContainText("Dona joana Teste");
  await expect(celular.getByRole("link", { name: /Ligar para/ })).toHaveAttribute(
    "href",
    "tel:98999990002",
  );
  await expect(janela.getByRole("checkbox", { name: "Avisar Maria Teste" })).not.toBeChecked();
  await expect(janela.getByRole("checkbox", { name: "Avisar Dona joana Teste" })).toBeChecked();
  await expect(janela.getByText(/avisado \d{2}:\d{2}/)).toBeVisible();
});
