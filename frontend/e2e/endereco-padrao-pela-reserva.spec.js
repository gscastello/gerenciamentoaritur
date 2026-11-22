import { expect, test } from "@playwright/test";
import { escolherSentido, irParaODia } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #474: "Tornar endereço padrão" ao agendar ou editar uma reserva. O embarque e o desembarque
// da reserva viram o endereço de costume do passageiro no sentido dela (rpc_tornar_endereco_padrao).

const chamadasDe = (page, fn) => {
  const lista = [];
  page.on("request", (r) => {
    if (r.url().includes(`/rpc/${fn}`)) lista.push(r.postDataJSON?.());
  });
  return lista;
};

test("Agendar passagem com 'Tornar endereço padrão': depois da reserva, o endereço vira o padrão", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin", occupancy: {} });
  const padrao = chamadasDe(page, "rpc_tornar_endereco_padrao");
  await page.goto("/");
  await page.getByRole("button", { name: "Nova reserva" }).click();
  await expect(page.getByText("Agendar passagem")).toBeVisible();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Outros" });
  await page.getByLabel("Nome (ou telefone)").fill("Cliente Padrão");
  await page.getByLabel("Telefone (ou nome)").fill("98999990000");
  await page.getByRole("textbox", { name: /Anotação/ }).fill("Posto da BR, em frente à igreja");
  await page.getByLabel(/Tornar este o endereço padrão da Ida/).check();
  await page
    .locator("div.anim-pop")
    .getByRole("button", { name: /^Agendar$/ })
    .click();

  await expect.poll(() => padrao.length).toBe(1);
  expect(padrao[0]).toEqual({ p_reservation_id: "e2e-res-1" });
});

test("Agendar passagem sem marcar a caixa não mexe no endereço padrão", async ({ page }) => {
  let criou = false;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: () => {
      criou = true;
    },
  });
  const padrao = chamadasDe(page, "rpc_tornar_endereco_padrao");
  await page.goto("/");
  await page.getByRole("button", { name: "Nova reserva" }).click();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Outros" });
  await page.getByLabel("Nome (ou telefone)").fill("Cliente Sem Padrão");
  await page.getByLabel("Telefone (ou nome)").fill("98999990001");
  await page
    .locator("div.anim-pop")
    .getByRole("button", { name: /^Agendar$/ })
    .click();
  await expect.poll(() => criou).toBe(true);
  await expect(page.getByText("Agendar passagem")).toHaveCount(0);
  expect(padrao.length).toBe(0);
});

test("Editar reserva com 'Tornar endereço padrão da Volta': salva a edição e depois o padrão", async ({
  page,
}) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date(),
  );
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-padrao-1",
        customer_id: "cli-padrao-1",
        data: hoje,
        direcao: "volta",
        pontoId: "pirapemas",
        nome: "Passageira Padrão",
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
  const edicoes = chamadasDe(page, "rpc_edit_reservation");
  const padrao = chamadasDe(page, "rpc_tornar_endereco_padrao");

  await page.goto("/");
  await escolherSentido(page, "Volta");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await irParaODia(page, hoje);
  await page
    .getByRole("button", { name: /^Mais ações/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Editar reserva")).toBeVisible();
  await page.getByLabel("Local de desembarque").fill("Cohab Anil, rua 3");
  await page.getByLabel(/Tornar este o endereço padrão da Volta/).check();
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByText("Editar reserva")).toHaveCount(0);
  await expect.poll(() => padrao.length).toBe(1);
  expect(edicoes.length).toBe(1);
  expect(padrao[0]).toEqual({ p_reservation_id: "res-padrao-1" });
});
