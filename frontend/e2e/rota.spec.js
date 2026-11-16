import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// "Rota" (issue #411, antiga Lista do Dia): o embarque da VOLTA — quem buscamos em casa em
// Pirapemas e Cantanhede para iniciar a viagem. A Ida não aparece no embarque. O desembarque é só
// a lista anotada na viagem, com Organizar e Copiar (issue #440).

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const reserva = (campos) => ({
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
  data: hoje(),
  ...campos,
});

test("Rota: só o embarque da Volta (Cantanhede e Pirapemas); a Ida não aparece", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    reservations: [
      reserva({
        id: "r-ida",
        direcao: "ida",
        pontoId: "busca",
        bairro: "Cohama",
        nome: "Passageira da Ida",
        telefone: "98999990001",
        valorUnit: 80,
        valorTotal: 80,
        desembarque: "Praça da Matriz, Cantanhede",
        desembarqueArea: "cantanhede",
      }),
      reserva({
        id: "r-ida-p1",
        direcao: "ida",
        pontoId: "rodoviaria",
        nome: "Primeiro de Pirapemas",
        telefone: "98999990004",
        desembarque: "Rua Grande, Pirapemas",
        criadoEm: "2026-11-15T10:00:00Z",
      }),
      reserva({
        id: "r-ida-p2",
        direcao: "ida",
        pontoId: "retorno",
        nome: "Segundo de Pirapemas",
        telefone: "98999990005",
        desembarque: "Povoado Campestre",
        criadoEm: "2026-11-15T11:00:00Z",
      }),
      reserva({
        id: "r-cant",
        direcao: "volta",
        pontoId: "cantanhede",
        embarque: "Praça da Cruz",
        nome: "Passageiro de Cantanhede",
        telefone: "98999990002",
      }),
      reserva({
        id: "r-pira",
        direcao: "volta",
        pontoId: "pirapemas",
        embarque: "Rua do Sol",
        nome: "Passageira de Pirapemas",
        telefone: "98999990003",
      }),
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Rota$/ })
    .first()
    .click();

  await expect(page.getByRole("heading", { name: "Rota" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CANTANHEDE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "PIRAPEMAS" })).toBeVisible();
  await expect(page.getByText("Passageiro de Cantanhede")).toBeVisible();
  await expect(page.getByText("Passageira de Pirapemas")).toBeVisible();
  await expect(page.getByText("Passageira da Ida")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "BUSCAR EM CASA" })).toHaveCount(0);
  await expect(page.getByTestId("resumo-da-lista")).toContainText("2 passageiros");

  // desembarque: só a lista anotada na viagem (issue #440); o desembarque por cidade saiu
  await page.getByRole("button", { name: "Desembarque", exact: true }).click();
  await expect(page.getByText("Desembarque", { exact: true }).last()).toBeVisible();
  await expect(page.getByLabel("Onde o passageiro desce")).toBeVisible();
  await expect(page.getByRole("heading", { name: "CANTANHEDE" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "PIRAPEMAS" })).toHaveCount(0);
  await expect(page.getByText("Praça da Matriz, Cantanhede")).toHaveCount(0);
  await expect(page.getByText("Anotar desembarque")).toHaveCount(0);
});
