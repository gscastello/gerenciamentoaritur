import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issues #196 e #198: reservas de "Buscar em casa" — copiar endereço +
// contato, modo EDITAR (reordenar e definir quem busca em lote: táxi,
// Gustavo, Maurício, Ari — cada um na sua cor) e copiar a lista de cada grupo.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const base = {
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
};

const RESERVAS = [
  {
    ...base,
    id: "b1",
    pontoId: "busca",
    bairro: "Cohatrac",
    rua: "Rua 7",
    nome: "Ana Taxi",
    telefone: "98987654321",
    telefone2: "98981110000",
    buscaPor: "taxi",
    criadoEm: "2026-10-01T10:00:00Z",
  },
  {
    ...base,
    id: "b2",
    pontoId: "busca",
    bairro: "Anil",
    nome: "Beto Taxi",
    telefone: "98999990000",
    quantidade: 2,
    buscaPor: "taxi",
    criadoEm: "2026-10-01T11:00:00Z",
  },
  {
    ...base,
    id: "b3",
    pontoId: "busca",
    bairro: "Cohama",
    nome: "Caio Gustavo",
    telefone: "98988880000",
    buscaPor: "proprio",
    criadoEm: "2026-10-01T12:00:00Z",
  },
  {
    ...base,
    id: "r1",
    pontoId: "rodoviaria",
    nome: "Rita Rodoviaria",
    telefone: "98977770000",
  },
];

async function abrir(page) {
  // captura o que seria copiado, sem depender de permissão de área de transferência
  await page.addInitScript(() => {
    window.__copiado = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t) => {
          window.__copiado = t;
        },
      },
    });
  });
  await mockSupabase(page, { role: "admin", occupancy: {}, reservations: RESERVAS });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje);
}

const linha = (page, nome) => page.locator("div.row-hover", { hasText: nome });
const itemEditor = (page, nome) => page.locator("li", { hasText: nome });

test("Buscar em casa: copia endereço + contato da reserva", async ({ page }) => {
  await abrir(page);
  await linha(page, "Ana Taxi")
    .getByRole("button", { name: /Copiar endereço \+ contato/ })
    .click();
  await expect(linha(page, "Ana Taxi").getByText("Copiado")).toBeVisible();
  const copiado = await page.evaluate(() => window.__copiado);
  expect(copiado).toContain("Cohatrac");
  expect(copiado).toContain("Rua 7");
  // contato formatado, com o secundário
  expect(copiado).toContain("(98) 98765-4321 / (98) 98111-0000");
});

test("só Buscar em casa tem copiar e o botão EDITAR", async ({ page }) => {
  await abrir(page);
  await expect(linha(page, "Rita Rodoviaria")).toBeVisible();
  await expect(
    linha(page, "Rita Rodoviaria").getByRole("button", { name: /Copiar endereço/ }),
  ).toHaveCount(0);
  // um único EDITAR: o da seção Buscar em casa
  await expect(page.getByRole("button", { name: "EDITAR LISTA" })).toHaveCount(1);
});

test("EDITAR: seleciona reservas e define quem busca em lote (Ari) — só grava ao salvar", async ({
  page,
}) => {
  let corpo = null;
  let chamadas = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_set_pickup_transport_many")) {
      corpo = r.postDataJSON?.();
      chamadas += 1;
    }
  });
  await abrir(page);
  await page.getByRole("button", { name: "EDITAR LISTA" }).click();

  // sem seleção, os botões de responsável ficam desligados
  await expect(page.getByRole("button", { name: "Atribuir a Ari" })).toBeDisabled();

  await page.getByRole("checkbox", { name: "Selecionar Ana Taxi" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Beto Taxi" }).check();
  await expect(page.getByText("2 selecionada(s)")).toBeVisible();
  await page.getByRole("button", { name: "Atribuir a Ari" }).click();

  // o rascunho já mostra Ari nas duas, mas nada foi gravado ainda
  await expect(itemEditor(page, "Ana Taxi").getByText("Ari", { exact: true })).toBeVisible();
  await expect(page.getByText("Alterações ainda não salvas")).toBeVisible();
  expect(chamadas).toBe(0);

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => chamadas).toBe(1);
  expect(corpo.p_mode).toBe("ari");
  expect([...corpo.p_ids].sort()).toEqual(["b1", "b2"]);

  // saiu do modo edição e a linha ficou como Ari
  await expect(page.getByRole("button", { name: "EDITAR LISTA" })).toBeVisible();
  await expect(linha(page, "Ana Taxi").getByText("Ari", { exact: true })).toBeVisible();
});

test("EDITAR: Cancelar descarta o rascunho", async ({ page }) => {
  let gravou = false;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_set_pickup_transport_many")) gravou = true;
  });
  await abrir(page);
  await page.getByRole("button", { name: "EDITAR LISTA" }).click();
  await page.getByRole("checkbox", { name: "Selecionar Ana Taxi" }).check();
  await page.getByRole("button", { name: "Atribuir a Maurício" }).click();
  await page.getByRole("button", { name: "Cancelar edição" }).click();

  expect(gravou).toBe(false);
  await expect(linha(page, "Ana Taxi").getByText("Táxi", { exact: true })).toBeVisible();
});

test("EDITAR: reordena com as setas e grava a nova ordem", async ({ page }) => {
  let ordem = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_reorder_pickup")) ordem = r.postDataJSON?.().p_ids;
  });
  await abrir(page);
  await page.getByRole("button", { name: "EDITAR LISTA" }).click();

  await page.getByRole("button", { name: "Subir Caio Gustavo" }).click();
  await page.getByRole("button", { name: "Subir Caio Gustavo" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect.poll(() => ordem).toEqual(["b3", "b1", "b2"]);
  // volta ao modo normal e a lista já aparece na nova ordem
  await expect(page.getByRole("button", { name: "EDITAR LISTA" })).toBeVisible();
  const nomes = await page.locator("div.row-hover").allInnerTexts();
  const posicao = (nome) => nomes.findIndex((t) => t.includes(nome));
  expect(posicao("Caio Gustavo")).toBeLessThan(posicao("Ana Taxi"));
  expect(posicao("Ana Taxi")).toBeLessThan(posicao("Beto Taxi"));
});

test("EDITAR: Agrupar por quem busca junta Táxi, Gustavo, Maurício e Ari", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "EDITAR LISTA" }).click();
  await page.getByRole("checkbox", { name: "Selecionar Ana Taxi" }).check();
  await page.getByRole("button", { name: "Atribuir a Ari" }).click();
  await page.getByRole("button", { name: "Agrupar por quem busca" }).click();

  // Beto (táxi) → Caio (Gustavo) → Ana (Ari)
  const nomes = await page.locator("li").allInnerTexts();
  const posicao = (nome) => nomes.findIndex((t) => t.includes(nome));
  expect(posicao("Beto Taxi")).toBeLessThan(posicao("Caio Gustavo"));
  expect(posicao("Caio Gustavo")).toBeLessThan(posicao("Ana Taxi"));
});

test("cada grupo tem a sua cor e o cabeçalho copia a lista do grupo", async ({ page }) => {
  await abrir(page);
  const cor = (nome) => linha(page, nome).evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(await cor("Ana Taxi")).not.toBe(await cor("Caio Gustavo"));

  const copiarTaxi = page.getByRole("button", { name: "Táxi 2" });
  await expect(copiarTaxi).toBeVisible();
  await expect(page.getByRole("button", { name: "Gustavo 1" })).toBeVisible();
  await copiarTaxi.click();
  const lista = await page.evaluate(() => window.__copiado);
  expect(lista.split("\n")).toHaveLength(2);
  expect(lista).toContain("1) ");
  expect(lista).toContain("2) ");
  expect(lista).toContain("Anil (2 passagens)");
  expect(lista).not.toContain("Cohama");
});
