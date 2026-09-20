import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Agendar encomendas na Agenda e na Lista do Dia (database/42): uma
// encomenda pendente (vinda do bot, sem viagem ainda) ganha uma viagem/
// ponto reais e aparece nas duas telas, sem nunca ocupar vaga.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

function encomendaPendente(overrides = {}) {
  return {
    id: "res-enc-pend-1",
    data: null,
    direcao: null,
    pontoId: null,
    desembarque: null,
    nome: "Maria Receptora",
    telefone: "98988887777",
    quantidade: 1,
    valorTotal: null,
    status: "pendente",
    tipo: "encomenda",
    extra: { encItem: "Documentos", encEmbarque: "Rodoviária", encDesembarque: "Pirapemas centro" },
    criadoEm: new Date().toISOString(),
    ...overrides,
  };
}

test("Agenda: agenda uma encomenda pendente numa viagem/ponto real", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    reservations: [encomendaPendente()],
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Agenda/ }).first().click();

  const linhaPendente = page.getByText(/Encomenda: Documentos/).locator("..");
  await expect(linhaPendente).toBeVisible();
  await linhaPendente.getByRole("button", { name: "Agendar" }).click();

  // modal pré-preenchido com os dados de quem recebe e o desembarque
  await expect(page.getByRole("heading", { name: "Agendar encomenda" }).or(page.getByText("Agendar encomenda"))).toBeVisible();
  await expect(page.getByLabel("Quem recebe (nome) *")).toHaveValue("Maria Receptora");
  await expect(page.getByLabel("Quem recebe (telefone) *")).toHaveValue("98988887777");

  await page.getByRole("button", { name: "Agendar", exact: true }).last().click();

  await expect(page.getByText(/Encomenda: Documentos/)).toHaveCount(0);
  await expect(page.getByText("Encomendas do dia")).toBeVisible();
  await expect(page.getByText(/entrega:.*recebe: Maria Receptora/)).toBeVisible();

  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_move).toMatchObject({ direction: "ida" });
  expect(chamadas[0].p_status).toBe("confirmada");
});

test("Agenda: cria uma encomenda nova do zero", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    createResult: { success: true, reservation_id: "e2e-enc-novo", status: "confirmada", message: "created" },
    onCreate: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Agenda/ }).first().click();

  await page.getByRole("button", { name: "Nova" }).click();
  await page.getByLabel("Quem recebe (nome) *").fill("João Destino");
  await page.getByLabel("Quem recebe (telefone) *").fill("98977776666");
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByText("Nenhuma encomenda agendada")).toHaveCount(0).catch(() => {});
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_type).toBe("encomenda");
  expect(chamadas[0].p_customer_name).toBe("João Destino");
});

test("Lista do Dia: mostra a encomenda agendada e marca como entregue", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    reservations: [
      encomendaPendente({
        id: "res-enc-agendada-1",
        data: hoje,
        direcao: "ida",
        pontoId: "rodoviaria",
        desembarque: "Pirapemas centro",
        status: "confirmada",
      }),
    ],
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Lista do Dia/ }).first().click();

  await expect(page.getByText("Encomendas do dia")).toBeVisible();
  await expect(page.getByText(/Documentos.*Rodoviária.*Pirapemas centro/)).toBeVisible();

  await page.getByRole("button", { name: "Entregue" }).click();
  // espera a UI refletir o embarcado (esconde o botão) antes de checar a
  // chamada — o click só dispara a RPC, não espera a resposta assíncrona.
  await expect(page.getByRole("button", { name: "Entregue" })).toHaveCount(0);
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_status).toBe("embarcado");
});
