import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #196: reservas de "Buscar em casa" — copiar endereço + contato,
// separar por cores quem busca (táxi, Gustavo, Maurício, Ari) e copiar a
// lista de cada grupo para repassar aos taxistas.

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
  },
  {
    ...base,
    id: "b3",
    pontoId: "busca",
    bairro: "Cohama",
    nome: "Caio Gustavo",
    telefone: "98988880000",
    buscaPor: "proprio",
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

test("só Buscar em casa tem o botão de copiar", async ({ page }) => {
  await abrir(page);
  await expect(linha(page, "Rita Rodoviaria")).toBeVisible();
  await expect(
    linha(page, "Rita Rodoviaria").getByRole("button", { name: /Copiar endereço/ }),
  ).toHaveCount(0);
  await expect(linha(page, "Rita Rodoviaria").getByRole("group")).toHaveCount(0);
});

test("seletor das 4 opções: marca quem busca e grava pelo RPC", async ({ page }) => {
  let corpo = null;
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_set_pickup_transport")) corpo = r.postDataJSON?.();
  });
  await abrir(page);
  const grupo = linha(page, "Caio Gustavo").getByRole("group", {
    name: "Quem busca este passageiro",
  });
  for (const nome of ["Táxi", "Gustavo", "Maurício", "Ari"]) {
    await expect(grupo.getByRole("button", { name: nome })).toBeVisible();
  }
  await expect(grupo.getByRole("button", { name: "Gustavo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await grupo.getByRole("button", { name: "Ari" }).click();
  await expect.poll(() => corpo?.p_mode).toBe("ari");
  await expect(grupo.getByRole("button", { name: "Ari" })).toHaveAttribute("aria-pressed", "true");
  await expect(grupo.getByRole("button", { name: "Gustavo" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("cada grupo tem a sua cor e o cabeçalho copia a lista do grupo", async ({ page }) => {
  await abrir(page);
  // linha do táxi (âmbar) e do Gustavo (azul) com bordas de cores diferentes
  const cor = (nome) => linha(page, nome).evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(await cor("Ana Taxi")).not.toBe(await cor("Caio Gustavo"));

  // botões de grupo no cabeçalho: Táxi 2 e Gustavo 1
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
