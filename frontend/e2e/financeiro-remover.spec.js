import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #200: remover / limpar lançamentos financeiros — inclusive os que
// vêm de reservas e da operação (combustível/manutenção). Sempre confirma e
// diz o que sai e o que continua existindo.

test.use({ viewport: { width: 1200, height: 900 } });

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

const lancamento = (id, extra) => ({
  id,
  entry_date: hoje,
  type: "receita",
  category: "passagem",
  amount: 60,
  description: id,
  reservation_id: null,
  fuel_record_id: null,
  maintenance_id: null,
  template_id: null,
  ...extra,
});

const ENTRADAS = [
  lancamento("Receita da reserva A", { reservation_id: "res-a", amount: 60 }),
  lancamento("Receita da reserva B", { reservation_id: "res-b", amount: 120 }),
  lancamento("Taxa manual", { type: "despesa", category: "outro", amount: 25 }),
  lancamento("Diesel da viagem", {
    type: "despesa",
    category: "combustivel",
    amount: 300,
    fuel_record_id: "fuel-1",
  }),
];

const linha = (page, texto) => page.locator("tr", { hasText: texto });

async function abrir(page, entradas = ENTRADAS) {
  await mockSupabase(page, { role: "admin", financialEntries: entradas });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible({
    timeout: 10000,
  });
  let botao = page.getByRole("button", { name: /^Financeiro$/ });
  if ((await botao.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    botao = page.getByRole("button", { name: /^Financeiro$/ });
  }
  await botao.click();
  await expect(linha(page, "Receita da reserva A")).toBeVisible();
}

test("remove um lançamento vindo de reserva — confirma dizendo que a reserva continua", async ({
  page,
}) => {
  await abrir(page);
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await linha(page, "Receita da reserva A")
    .getByRole("button", { name: "Remover lançamento" })
    .click();

  await expect(linha(page, "Receita da reserva A")).toHaveCount(0);
  expect(mensagem).toContain("Remover este lançamento?");
  expect(mensagem).toContain("vem de reservas");
  expect(mensagem).toContain("a reserva e o pagamento continuam");
  // os outros ficam
  await expect(linha(page, "Receita da reserva B")).toBeVisible();
});

test("cancelar a confirmação não remove nada", async ({ page }) => {
  await abrir(page);
  page.once("dialog", (d) => d.dismiss());
  await linha(page, "Taxa manual").getByRole("button", { name: "Remover lançamento" }).click();
  await expect(linha(page, "Taxa manual")).toBeVisible();
});

test("lançamento da operação (combustível) também pode ser removido", async ({ page }) => {
  await abrir(page);
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await linha(page, "Diesel da viagem").getByRole("button", { name: "Remover lançamento" }).click();
  await expect(linha(page, "Diesel da viagem")).toHaveCount(0);
  expect(mensagem).toContain("vem da operação (combustível/manutenção)");
});

test("seleciona vários e remove de uma vez", async ({ page }) => {
  await abrir(page);
  await page.getByRole("checkbox", { name: "Selecionar Receita da reserva A" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Receita da reserva B" }).check();
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await page.getByRole("button", { name: "Remover selecionados (2)" }).click();

  expect(mensagem).toContain("Remover os 2 lançamentos selecionados?");
  expect(mensagem).toContain("2 vêm de reservas");
  await expect(linha(page, "Receita da reserva A")).toHaveCount(0);
  await expect(linha(page, "Receita da reserva B")).toHaveCount(0);
  await expect(linha(page, "Taxa manual")).toBeVisible();
});

test("Limpar o dia remove todos os lançamentos do dia", async ({ page }) => {
  await abrir(page);
  let mensagem = "";
  page.once("dialog", (d) => {
    mensagem = d.message();
    d.accept();
  });
  await page.getByRole("button", { name: /Limpar o dia \(4\)/ }).click();

  expect(mensagem).toContain("Limpar TODOS os 4 lançamentos");
  expect(mensagem).toContain("fechamento de caixa");
  await expect(page.locator("td", { hasText: "Nenhum lançamento neste dia." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Limpar o dia/ })).toHaveCount(0);
});

test("Selecionar todos marca todos e habilita remover", async ({ page }) => {
  await abrir(page);
  await page.getByRole("checkbox", { name: "Selecionar todos os lançamentos do dia" }).check();
  await expect(page.getByRole("button", { name: "Remover selecionados (4)" })).toBeVisible();
});
