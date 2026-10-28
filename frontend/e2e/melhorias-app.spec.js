import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #192: telefone secundário, cidades de desembarque (revisão),
// limpar notificações/pendências e endereço em destaque na Agenda.

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

function proximaTerca() {
  const d = new Date();
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== 2);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(d);
}

const base = {
  data: hoje,
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
};

async function abrirAgenda(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
}

test("Agenda: endereço em destaque, nome em segundo plano e telefone secundário", async ({
  page,
}) => {
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        ...base,
        id: "res-busca",
        direcao: "ida",
        pontoId: "busca",
        bairro: "Cohatrac",
        nome: "João do Bairro Teste",
        telefone: "98987654321",
        telefone2: "98981110000",
      },
    ],
  });
  await abrirAgenda(page);
  await page.locator('input[type="date"]').first().fill(hoje);

  const linha = page.locator("div.row-hover", { hasText: "João do Bairro Teste" });
  const tamanho = (loc) => loc.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const endereco = linha.getByText("Cohatrac", { exact: true });
  const nome = linha.getByText("João do Bairro Teste", { exact: true });
  await expect(endereco).toBeVisible();
  await expect(nome).toBeVisible();
  // o endereço é maior que o nome
  expect(await tamanho(endereco)).toBeGreaterThan(await tamanho(nome));

  // os dois telefones aparecem como links de ligação
  await expect(linha.getByRole("link", { name: /98987654321/ })).toBeVisible();
  await expect(linha.getByRole("link", { name: /2º.*98981110000/ })).toBeVisible();
});

test("Agendar passagem: cidade que exige revisão nasce pendente e leva o telefone secundário", async ({
  page,
}) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await abrirAgenda(page);
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();
  await expect(page.getByText("Agendar passagem")).toBeVisible();

  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await page.getByLabel("Nome (ou telefone)").fill("Cliente Campestre E2E");
  await page.getByLabel("Telefone (ou nome)").fill("98999998888");
  await page.getByLabel("Telefone secundário (opcional)").fill("+55 98 98111-2222");
  await page.getByLabel("Data").fill(proximaTerca());
  await page.getByLabel("Cidade do desembarque (opcional)").selectOption({ label: "Campestre" });
  await expect(page.getByText(/fica pendente até você revisar/)).toBeVisible();

  await page
    .getByRole("button", { name: /^Agendar$/ })
    .first()
    .click();

  await expect.poll(() => corpo?.p_status, { timeout: 10000 }).toBe("pendente");
  expect(corpo.p_dropoff_area).toBe("campestre");
  expect(corpo.p_customer_phone_secondary).toBe("98981112222");
  expect(corpo.p_pending_reason).toMatch(/Campestre/);
});

test("Agendar passagem: cidade padrão continua confirmada direto", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await abrirAgenda(page);
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();

  await page.getByLabel("Categoria de embarque").selectOption({ label: "Rodoviária" });
  await page.getByLabel("Nome (ou telefone)").fill("Cliente Cantanhede E2E");
  await page.getByLabel("Telefone (ou nome)").fill("98999997777");
  await page.getByLabel("Data").fill(proximaTerca());
  await page.getByLabel("Cidade do desembarque (opcional)").selectOption({ label: "Cantanhede" });

  await page
    .getByRole("button", { name: /^Agendar$/ })
    .first()
    .click();

  await expect.poll(() => corpo?.p_status, { timeout: 10000 }).toBe("confirmada");
  expect(corpo.p_dropoff_area).toBe("cantanhede");
  expect(corpo.p_customer_phone_secondary).toBeNull();
});

test("Sino: Limpar esvazia a lista de notificações", async ({ page }) => {
  await mockSupabase(page, {
    role: "admin",
    notifications: [
      {
        id: "n1",
        kind: "lotacao",
        title: "Viagem lotada — ida 15/09",
        body: "A ida atingiu a capacidade.",
        reservation_id: null,
        trip_date: "2026-09-15",
        direction: "ida",
        meta: {},
        created_at: new Date(Date.now() - 5 * 60000).toISOString(),
        lida: false,
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Notificações/ }).click();
  await expect(page.getByText("Viagem lotada — ida 15/09")).toBeVisible();

  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(page.getByText("Nenhuma notificação.")).toBeVisible();
  await expect(page.getByText("Viagem lotada — ida 15/09")).toHaveCount(0);
});

test("Pendências: Limpar todas resolve as abertas", async ({ page }) => {
  const pend = (id, assunto) => ({
    id,
    source: "whatsapp",
    phone: null,
    customer_id: null,
    assunto,
    detail: "",
    status: "aberta",
    meta: {},
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    cliente: null,
    aberto_por: null,
  });
  await mockSupabase(page, {
    role: "atendente",
    pendencias: [pend("t1", "Pendência um"), pend("t2", "Pendência dois")],
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  let aba = page.getByRole("button", { name: "Pendências" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Pendências" });
  }
  await aba.first().click();
  await expect(page.getByText("Pendência um")).toBeVisible();

  await page.getByRole("button", { name: /Limpar todas \(2\)/ }).click();
  await expect(page.getByText("Nenhuma pendência aberta.")).toBeVisible();
});
