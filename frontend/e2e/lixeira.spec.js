import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #206: Lixeira de reservas canceladas — restaurar uma reserva
// cancelada por engano — e confirmação antes de cancelar na Agenda.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const base = {
  data: hoje,
  direcao: "ida",
  pontoId: "rodoviaria",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
};

const RESERVAS = [
  { ...base, id: "ok-1", nome: "Rita Ativa", telefone: "98911110000", status: "confirmada" },
  {
    ...base,
    id: "can-1",
    nome: "Carlos Cancelado",
    telefone: "98922220000",
    status: "cancelada",
    canceladaEm: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    canceladaPor: "Atendente E2E",
  },
  {
    ...base,
    id: "can-2",
    nome: "Dora Cancelada",
    telefone: "98933330000",
    status: "cancelada",
    canceladaEm: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    ...base,
    id: "can-velha",
    nome: "Velha Demais",
    telefone: "98944440000",
    status: "cancelada",
    canceladaEm: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
  },
];

async function abrirAgenda(page, opts = {}) {
  await mockSupabase(page, { role: "admin", occupancy: {}, reservations: RESERVAS, ...opts });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje);
}

const lixeira = (page) => page.getByRole("button", { name: /Lixeira — reservas canceladas/ });

test("a Lixeira conta as canceladas dos últimos 30 dias e mostra quem cancelou", async ({
  page,
}) => {
  await abrirAgenda(page);
  // 2 dentro dos 30 dias (a de 60 dias fica de fora)
  await expect(lixeira(page)).toContainText("2");
  await lixeira(page).click();

  await expect(page.getByText("Carlos Cancelado")).toBeVisible();
  await expect(page.getByText(/cancelada.*por Atendente E2E/)).toBeVisible();
  await expect(page.getByText("Dora Cancelada")).toBeVisible();
  await expect(page.getByText("Velha Demais")).toHaveCount(0);
  await expect(page.getByText("Rita Ativa").first()).toBeVisible();
});

test("busca na lixeira por nome", async ({ page }) => {
  await abrirAgenda(page);
  await lixeira(page).click();
  await page.getByLabel("Buscar na lixeira").fill("dora");
  await expect(page.getByText("Dora Cancelada")).toBeVisible();
  await expect(page.getByText("Carlos Cancelado")).toHaveCount(0);
});

test("Restaurar pede confirmação, chama o RPC e a reserva volta para a lista", async ({ page }) => {
  let corpo = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_restore_reservation")) corpo = r.postDataJSON?.();
  });
  await abrirAgenda(page);
  await lixeira(page).click();

  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await page.getByRole("button", { name: "Restaurar Carlos Cancelado" }).click();

  expect(mensagem).toContain("Restaurar a reserva de Carlos Cancelado");
  await expect.poll(() => corpo?.p_reservation_id).toBe("can-1");
  // saiu da lixeira e voltou para a Agenda
  await expect(lixeira(page)).toContainText("1");
  await expect(page.locator("div.row-hover", { hasText: "Carlos Cancelado" })).toBeVisible();
});

test("restauração recusada (viagem lotada) mostra o motivo e mantém na lixeira", async ({
  page,
}) => {
  await abrirAgenda(page, { restoreRecusado: true });
  await lixeira(page).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restaurar Carlos Cancelado" }).click();

  await expect(page.getByText(/viagem lotada/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restaurar Carlos Cancelado" })).toBeVisible();
});

test("Cancelar na Agenda pede confirmação — dispensar não cancela", async ({ page }) => {
  let cancelou = false;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_cancel_reservation")) cancelou = true;
  });
  await abrirAgenda(page);

  const linha = page.locator("div.row-hover", { hasText: "Rita Ativa" });
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.dismiss();
  });
  await linha.getByRole("button", { name: "Cancelar" }).click();
  expect(mensagem).toContain("Cancelar a reserva de Rita Ativa?");
  expect(mensagem).toContain("Lixeira");
  expect(cancelou).toBe(false);
  await expect(linha).toBeVisible();
});

test("confirmar o cancelamento manda a reserva para a Lixeira", async ({ page }) => {
  await abrirAgenda(page);
  await expect(lixeira(page)).toContainText("2");

  page.once("dialog", (d) => d.accept());
  await page
    .locator("div.row-hover", { hasText: "Rita Ativa" })
    .getByRole("button", { name: "Cancelar" })
    .click();

  await expect(lixeira(page)).toContainText("3");
  await expect(page.locator("div.row-hover", { hasText: "Rita Ativa" })).toHaveCount(0);
});
