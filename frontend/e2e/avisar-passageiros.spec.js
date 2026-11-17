import { expect, test } from "@playwright/test";
import { escolherSentido, irParaODia } from "./support/navegar.js";
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
  await irParaODia(page, hoje);
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

test("Agenda: pedir confirmação da viagem e ver quem já confirmou (issue #434)", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      res("c1", {
        pontoId: "rodoviaria",
        nome: "Ana Teste",
        telefone: "98999990011",
        extra: { presenca: { resposta: "sim", em: new Date().toISOString() } },
      }),
      res("c2", { pontoId: "retorno", nome: "Bruno Teste", telefone: "98999990012" }),
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await irParaODia(page, hoje);
  await escolherSentido(page, "Ida");
  // na Agenda, quem respondeu SIM aparece marcado
  await expect(page.getByText("✓ Confirmou")).toBeVisible();

  await page.getByRole("button", { name: "Avisar passageiros" }).click();
  const janela = page.getByTestId("avisar-passageiros");
  await janela.getByRole("radio", { name: "Confirmar viagem" }).click();
  await expect(janela.getByText(/Ana Teste/)).toBeVisible();
  await expect(janela.getByText("confirmou", { exact: true })).toBeVisible();
  await expect(
    janela.getByText(/Olá, Bruno! Sua passagem está confirmada pra (hoje|amanhã)\?/),
  ).toBeVisible();
  await janela.getByRole("button", { name: "Enviar para 2" }).click();
  await janela.getByRole("button", { name: "Confirmar: enviar para 2" }).click();
  await expect(page.getByTestId("resultado-do-aviso")).toHaveText(
    "2 enviados · 0 para avisar pelo celular",
  );
  expect(page.avisosTipos).toEqual(["confirmacao"]);

  // "Em rota" também na Ida (a mensagem não cita ponto nem horário)
  await janela.getByRole("radio", { name: "Em rota" }).click();
  await expect(
    janela.getByText(/Olá, Ana! Já estamos em rota buscando os passageiros/),
  ).toBeVisible();
});

test('Agenda: na Volta, "Em rota" avisa que já estamos buscando', async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      res("v1", {
        direcao: "volta",
        pontoId: "pirapemas",
        embarque: "Rua do Sol",
        nome: "Carla Teste",
        telefone: "98999990021",
      }),
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await irParaODia(page, hoje);
  await escolherSentido(page, "Volta");
  await page.getByRole("button", { name: "Avisar passageiros" }).click();
  const janela = page.getByTestId("avisar-passageiros");
  await janela.getByRole("radio", { name: "Em rota" }).click();
  await expect(
    janela.getByText(
      /Olá, Carla! Já estamos em rota buscando os passageiros, aguarde no seu local de embarque que chegaremos em breve\./,
    ),
  ).toBeVisible();
  await janela.getByRole("button", { name: "Enviar para 1" }).click();
  await janela.getByRole("button", { name: "Confirmar: enviar para 1" }).click();
  await expect(page.getByTestId("resultado-do-aviso")).toHaveText(
    "1 enviado · 0 para avisar pelo celular",
  );
  expect(page.avisosTipos).toEqual(["em_rota"]);
});
