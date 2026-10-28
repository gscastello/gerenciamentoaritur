import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #212: reordenar rápido as reservas de cada seção da Lista do Dia
// (setas, topo, digitar a posição) e gravar a ordem (rpc_reorder_pickup).

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const base = {
  data: hoje,
  direcao: "ida",
  pontoId: "rodoviaria",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
};

const RESERVAS = [
  {
    ...base,
    id: "r1",
    nome: "Primeiro Pax",
    telefone: "98911110001",
    criadoEm: "2026-10-01T10:00:00Z",
  },
  {
    ...base,
    id: "r2",
    nome: "Segundo Pax",
    telefone: "98911110002",
    criadoEm: "2026-10-01T11:00:00Z",
  },
  {
    ...base,
    id: "r3",
    nome: "Terceiro Pax",
    telefone: "98911110003",
    criadoEm: "2026-10-01T12:00:00Z",
  },
];

async function abrirLista(page) {
  await mockSupabase(page, { role: "admin", occupancy: {}, reservations: RESERVAS });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Lista do Dia/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje);
}

const nomesNaOrdem = (page) =>
  page
    .locator("ul li")
    .evaluateAll((lis) =>
      lis.map((li) => li.textContent.match(/(Primeiro|Segundo|Terceiro) Pax/)?.[1]).filter(Boolean),
    );

test("ORGANIZAR: topo, setas e posição digitada; salva a ordem de uma vez", async ({ page }) => {
  let corpo = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_reorder_pickup")) corpo = r.postDataJSON?.();
  });
  await abrirLista(page);
  await page.getByRole("button", { name: "ORGANIZAR" }).first().click();
  expect(await nomesNaOrdem(page)).toEqual(["Primeiro", "Segundo", "Terceiro"]);

  await page.getByRole("button", { name: "Mover Terceiro Pax para o topo" }).click();
  expect(await nomesNaOrdem(page)).toEqual(["Terceiro", "Primeiro", "Segundo"]);

  await page.getByRole("button", { name: "Descer Terceiro Pax" }).click();
  expect(await nomesNaOrdem(page)).toEqual(["Primeiro", "Terceiro", "Segundo"]);

  const pos = page.getByLabel("Posição de Segundo Pax");
  await pos.fill("1");
  await pos.press("Enter");
  expect(await nomesNaOrdem(page)).toEqual(["Segundo", "Primeiro", "Terceiro"]);

  await page.getByRole("button", { name: "Salvar ordem" }).click();
  await expect.poll(() => corpo?.p_ids).toEqual(["r2", "r1", "r3"]);
  // depois de salvar, a lista do dia já aparece na nova ordem
  await expect(page.getByRole("button", { name: "Salvar ordem" })).toHaveCount(0);
  const corpoPagina = await page.locator("body").innerText();
  expect(corpoPagina.indexOf("Segundo Pax")).toBeLessThan(corpoPagina.indexOf("Primeiro Pax"));
  expect(corpoPagina.indexOf("Primeiro Pax")).toBeLessThan(corpoPagina.indexOf("Terceiro Pax"));
});

test("Cancelar edição descarta e não grava nada", async ({ page }) => {
  let chamou = false;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_reorder_pickup")) chamou = true;
  });
  await abrirLista(page);
  await page.getByRole("button", { name: "ORGANIZAR" }).first().click();
  await page.getByRole("button", { name: "Mover Terceiro Pax para o topo" }).click();
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await expect(page.getByRole("button", { name: "Salvar ordem" })).toHaveCount(0);
  expect(chamou).toBe(false);
});
