import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Regressão (2026-09-19): o mini-calendário de Lançamentos usava
// aspect-ratio dentro de um grid de colunas fluidas (1fr) — no celular
// (relatado pelo dono) as células ficavam gigantes/desproporcionais ao
// tocar num dia. Trocado por colunas de largura fixa, sem aspect-ratio.
// Também corrige "Contas a receber": a tabela de 5 colunas reservava
// largura mesmo vazia e cortava a própria mensagem de "sem pendências".

test.use({ viewport: { width: 360, height: 780 } });

async function abrirFinanceiro(page) {
  await mockSupabase(page, { role: "admin" });
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
}

test("calendário de Lançamentos continua com células quadradas e compactas depois de clicar num dia", async ({
  page,
}) => {
  await abrirFinanceiro(page);
  const dia15 = page.getByRole("button", { name: "15", exact: true });
  await expect(dia15).toBeVisible();

  const antes = await dia15.boundingBox();
  await dia15.click();
  const depois = await dia15.boundingBox();

  for (const box of [antes, depois]) {
    expect(box.width).toBeLessThan(60);
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  }
  // não pode ter estourado a largura da tela em nenhum momento
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('"Contas a receber" sem pendências mostra a mensagem inteira, sem tabela larga', async ({
  page,
}) => {
  await abrirFinanceiro(page);
  await page.getByRole("button", { name: "Contas a receber" }).click();

  const msg = page.getByText("Nenhuma conta pendente — tudo em dia.");
  await expect(msg).toBeVisible();
  const box = await msg.boundingBox();
  // a mensagem inteira precisa estar dentro da tela (nada cortado à direita)
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await expect(page.locator("table")).toHaveCount(0);
});

// Regressão (2026-09-21): os 3 cards de totais do Relatório usavam
// grid-cols-3 fixo (sem responsivo), então no celular cada card ficava
// estreito demais e o valor em R$ era cortado com reticências ("R$ 3...").
test("Relatório: cards de totais mostram o valor completo no celular", async ({ page }) => {
  const ano = new Date().getFullYear();
  await mockSupabase(page, {
    role: "admin",
    financialEntries: [
      { id: "e1", entry_date: `${ano}-06-10`, type: "receita", category: "passagem", amount: 31767 },
      { id: "e2", entry_date: `${ano}-06-10`, type: "despesa", category: "combustivel", amount: 13135 },
    ],
  });
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
  await page.getByRole("button", { name: "Relatório" }).click();

  // getByText acha o texto mesmo truncado por CSS (overflow:hidden não
  // muda o texto no DOM) — o teste real é conferir que a div do valor não
  // estourou (scrollWidth > clientWidth é a marca do "R$ 3...").
  const cartoes = page.locator(".truncate", { hasText: "R$" });
  await expect(cartoes).toHaveCount(3);
  for (const cartao of await cartoes.all()) {
    const [scrollWidth, clientWidth] = await cartao.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  }
  await expect(page.getByText("R$ 31.767,00").first()).toBeVisible();
  await expect(page.getByText("R$ 13.135,00").first()).toBeVisible();
});

// Regressão (2026-09-21): a barra de sub-abas do Financeiro/Gestão
// (SubTabs) não tinha overflow nem scroll — com 4 abas (caso da Gestão),
// a última ("Lançamentos do mês") ficava completamente fora da tela, sem
// nenhum jeito de alcançá-la no celular.
test("Gestão: as 4 sub-abas continuam alcançáveis (scroll horizontal) no celular", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible({
    timeout: 10000,
  });
  let botao = page.getByRole("button", { name: /^Gestão$/ });
  if ((await botao.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    botao = page.getByRole("button", { name: /^Gestão$/ });
  }
  await botao.click();

  const aba = page.getByRole("button", { name: "Lançamentos do mês" });
  await aba.scrollIntoViewIfNeeded();
  await expect(aba).toBeVisible();
  await aba.click();
  await expect(page.getByText("Lançar custo do mês")).toBeVisible();
});
