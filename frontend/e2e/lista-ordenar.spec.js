import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #212: reordenar rápido as reservas de cada seção da Rota (antiga Lista do Dia)
// (setas, topo, digitar a posição) e gravar a ordem (rpc_reorder_pickup).

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const base = {
  data: hoje,
  direcao: "volta",
  pontoId: "cantanhede",
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
    .getByRole("button", { name: /^Rota$/ })
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

// Issue #413: arrastar pela alça ⋮⋮ funciona no celular (o arrastar do navegador só ia com mouse)
test("ORGANIZAR: arrastar pela alça reordena e salva", async ({ page }) => {
  let corpo = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_reorder_pickup")) corpo = r.postDataJSON?.();
  });
  await abrirLista(page);
  await page.getByRole("button", { name: "ORGANIZAR" }).first().click();
  expect(await nomesNaOrdem(page)).toEqual(["Primeiro", "Segundo", "Terceiro"]);

  const alca = page.getByRole("button", { name: "Arrastar Terceiro Pax" });
  const primeiro = page.locator('[data-ordem-id="r1"]');
  const de = await alca.boundingBox();
  const para = await primeiro.boundingBox();
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await page.mouse.down();
  for (let passo = 1; passo <= 8; passo += 1) {
    const y = de.y + de.height / 2 + ((para.y + 5 - (de.y + de.height / 2)) * passo) / 8;
    await page.mouse.move(de.x + de.width / 2, y);
  }
  await page.mouse.up();
  expect(await nomesNaOrdem(page)).toEqual(["Terceiro", "Primeiro", "Segundo"]);

  await page.getByRole("button", { name: "Salvar ordem" }).click();
  await expect.poll(() => corpo?.p_ids).toEqual(["r3", "r1", "r2"]);
});

test("ORGANIZAR: arrastar com o DEDO (toque) reordena", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "toque só no celular");
  await abrirLista(page);
  await page.getByRole("button", { name: "ORGANIZAR" }).first().click();

  const de = await page.getByRole("button", { name: "Arrastar Primeiro Pax" }).boundingBox();
  const para = await page.locator('[data-ordem-id="r3"]').boundingBox();
  const x = de.x + de.width / 2;
  const y0 = de.y + de.height / 2;
  const y1 = para.y + para.height - 5;
  const cdp = await page.context().newCDPSession(page);
  const toque = (type, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  await toque("touchStart", y0);
  for (let passo = 1; passo <= 10; passo += 1)
    await toque("touchMove", y0 + ((y1 - y0) * passo) / 10);
  await toque("touchEnd", y1);
  expect(await nomesNaOrdem(page)).toEqual(["Segundo", "Terceiro", "Primeiro"]);
});
