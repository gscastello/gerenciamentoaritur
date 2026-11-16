import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// CRM paginado no servidor (v_customers_stats, database/37).

const STATS = Array.from({ length: 3 }, (_, i) => ({
  customer_id: `c${i}`,
  nome: `Passageiro ${i}`,
  telefone: `9899000000${i}`,
  notes: "",
  bairro_padrao: null,
  viagens_count: 5 - i,
  total_passagens: 6 - i,
  cancelamentos: 0,
  nao_compareceu: 0,
  total_gasto: `${(3 - i) * 100}.00`,
  ultima_data: "2026-09-10",
  reservas_total: 5 - i,
}));

test("Passageiros: lista do servidor, busca e abre o detalhe", async ({ page }) => {
  await mockSupabase(page, { role: "admin", customersStats: STATS });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();

  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();

  await expect(page.getByText("3 passageiros")).toBeVisible();
  await expect(page.getByText("Passageiro 0")).toBeVisible();

  // busca no servidor
  await page.getByPlaceholder("Buscar por nome ou telefone…").fill("Passageiro 1");
  await expect(page.getByText("Passageiro 1")).toBeVisible();

  // abre o detalhe (carrega o histórico sob demanda) — o nome bate tanto
  // com o botão de expandir quanto com o de "Editar cadastro de …", então
  // a âncora no início do nome (P1, as iniciais) desambigua.
  await page.getByRole("button", { name: /^P1 Passageiro 1/ }).click();
  await expect(page.getByText("Notas do CRM")).toBeVisible();
});

// Histórico de viagens com a data (issue #436): próximas primeiro, depois as anteriores.
const diaMais = (n) => {
  const d = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date())}T12:00:00Z`,
  );
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ddmmaaaa = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const viagem = (campos) => ({
  customer_id: "c1",
  nome: "Passageiro 1",
  telefone: "98990000001",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
  ...campos,
});

test("Passageiros: histórico de viagens com a data, próximas antes das anteriores", async ({
  page,
}) => {
  const futura = diaMais(3);
  const passada = diaMais(-10);
  const cancelada = diaMais(-40);
  await mockSupabase(page, {
    role: "admin",
    customersStats: STATS,
    reservations: [
      viagem({
        id: "h-passada",
        data: passada,
        direcao: "volta",
        pontoId: "pirapemas",
        status: "embarcado",
        desembarque: "Rodoviária",
      }),
      viagem({
        id: "h-futura",
        data: futura,
        direcao: "ida",
        pontoId: "retorno",
        quantidade: 2,
        valorTotal: 120,
      }),
      viagem({
        id: "h-cancelada",
        data: cancelada,
        direcao: "ida",
        pontoId: "rodoviaria",
        status: "cancelada",
      }),
      // de outro passageiro: não entra
      viagem({
        id: "h-outro",
        customer_id: "c0",
        data: futura,
        direcao: "volta",
        pontoId: "cantanhede",
      }),
    ],
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  let aba = page.getByRole("button", { name: "Passageiros" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Passageiros" });
  }
  await aba.first().click();
  await page.getByRole("button", { name: /^P1 Passageiro 1/ }).click();

  const historico = page.getByRole("region", { name: "Histórico de viagens" });
  const linhas = historico.getByTestId("viagem-do-historico");
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(0)).toContainText(ddmmaaaa(futura));
  await expect(linhas.nth(0)).toContainText("Ida");
  await expect(linhas.nth(0)).toContainText("2P");
  await expect(linhas.nth(0)).toContainText("Confirmada");
  await expect(linhas.nth(1)).toContainText(ddmmaaaa(passada));
  await expect(linhas.nth(1)).toContainText("Volta");
  await expect(linhas.nth(1)).toContainText("→ Rodoviária");
  await expect(linhas.nth(1)).toContainText("Embarcou");
  await expect(linhas.nth(2)).toContainText(ddmmaaaa(cancelada));
  await expect(linhas.nth(2)).toContainText("Cancelada");
  await expect(historico.getByText("Próximas · 1")).toBeVisible();
  await expect(historico.getByText("Anteriores · 2")).toBeVisible();
});
