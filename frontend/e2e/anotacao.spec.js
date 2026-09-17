import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Anotação manual de endereço (pedido do usuário, 2026-09-17): tanto ao
// criar quanto ao editar uma reserva, o endereço/detalhe/referência vira
// UM campo de texto livre em vez de 3 caixinhas separadas (detalhe do
// ponto, rua, referência) — escolhe a categoria de embarque e escreve o
// resto à mão. Mapeia pra pickup_detail; street/reference_point somem.

test("Agendar passagem: anotação escrita à mão vai pro pickup_detail", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await expect(page.getByText("Agendar passagem")).toBeVisible();

  // ponto que NÃO é "Buscar em Casa" (sem bairro) — BR, precisa só da anotação
  await page.getByLabel("Categoria de embarque").selectOption({ label: "BR (Posto)" });
  await page.getByLabel("Nome *").fill("Cliente Anotação");
  await page.getByLabel("Telefone *").fill("98999990000");
  await page.getByLabel(/Anotação/).fill("perto do posto, portão azul");

  await page.getByRole("button", { name: /^Agendar$/ }).click();

  await expect.poll(() => corpo?.p_pickup_detail).toBe("perto do posto, portão azul");
  expect(corpo.p_street).toBeNull();
  expect(corpo.p_reference_point).toBeNull();
});

test("Agenda: editar reserva reescrevendo o endereço à mão", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-anot-1",
        data: hoje,
        direcao: "volta",
        pontoId: "pirapemas",
        nome: "Passageiro Anotação",
        telefone: "98991234567",
        quantidade: 1,
        valorUnit: 60,
        valorTotal: 60,
        pagamento: "dinheiro",
        status: "confirmada",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        rua: "Rua das Flores",
        referencia: "perto da praça",
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

  // já vem preenchida juntando o que existia (rua + referência)
  const anotacao = page.getByLabel(/Anotação/);
  await expect(anotacao).toHaveValue("Rua das Flores · ref.: perto da praça");

  await anotacao.fill("outro endereço, escrito à mão");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByText("Editar reserva")).toHaveCount(0);
  expect(chamadas.length).toBe(1);
  expect(chamadas[0].p_details.pickup_detail).toBe("outro endereço, escrito à mão");
  expect(chamadas[0].p_details.street).toBeNull();
  expect(chamadas[0].p_details.reference_point).toBeNull();
});
