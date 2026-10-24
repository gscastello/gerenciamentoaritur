import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #210: passagens extras (fora das 31 vagas) — seção EXTRAS na Agenda,
// marcar/desmarcar uma reserva e criar já como extra.

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
  status: "confirmada",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
};

const RESERVAS = [
  { ...base, id: "n-1", nome: "Rita Normal", telefone: "98911110000", quantidade: 2 },
  {
    ...base,
    id: "x-1",
    nome: "Estrada Extra",
    telefone: "98922220000",
    quantidade: 3,
    pontoId: "outro",
    extra: { fora_lotacao: true },
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

test("o extra aparece na seção EXTRAS e não entra na lotação", async ({ page }) => {
  await abrirAgenda(page);
  const secao = page.getByText("EXTRAS", { exact: true }).first();
  await expect(secao).toBeVisible();
  await expect(page.getByText("3 passagem(ns) · fora das vagas").first()).toBeVisible();
  // lotação da ida = só os 2 normais (31 vagas): 29 livres, extras à parte
  await expect(page.getByText("IDA").first()).toBeVisible();
  await expect(page.getByText("2/31").first()).toBeVisible();
  await expect(page.locator("div.row-hover", { hasText: "Estrada Extra" })).toBeVisible();
});

test("'Tornar extra' marca a reserva e ela vai para EXTRAS", async ({ page }) => {
  let corpo = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_set_reservation_extra")) corpo = r.postDataJSON?.();
  });
  await abrirAgenda(page);
  const linha = page.locator("div.row-hover", { hasText: "Rita Normal" });
  await linha.getByRole("button", { name: "Tornar extra" }).click();
  await expect.poll(() => corpo).toMatchObject({ p_reservation_id: "n-1", p_extra: true });
  await expect(page.getByText("5 passagem(ns) · fora das vagas").first()).toBeVisible();
});

test("'Voltar às vagas' recusado (viagem lotada) mostra o motivo", async ({ page }) => {
  await abrirAgenda(page, { extraRecusado: true });
  const linha = page.locator("div.row-hover", { hasText: "Estrada Extra" });
  await linha.getByRole("button", { name: "Voltar às vagas" }).click();
  await expect(page.getByText(/já está lotada/)).toBeVisible();
  await expect(page.locator("div.row-hover", { hasText: "Estrada Extra" })).toBeVisible();
});

test("Adicionar extra abre o agendamento já marcado como extra", async ({ page }) => {
  let payload = null;
  await abrirAgenda(page, {
    onCreate: (route) => {
      payload = route.request().postDataJSON?.();
    },
  });
  await page.getByRole("button", { name: "Adicionar extra" }).first().click();
  await expect(page.getByText("Adicionar passagem extra")).toBeVisible();
  await expect(page.getByLabel(/Passagem extra — fora das vagas/)).toBeChecked();
  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await page.getByLabel("Nome *").fill("Beira da Estrada");
  await page.getByLabel("Telefone *").fill("98988887777");
  await page
    .locator("div.anim-pop")
    .getByRole("button", { name: /^Agendar$/ })
    .click();
  await expect.poll(() => payload?.p_extra_data?.fora_lotacao).toBe(true);
});
