import { expect, test } from "@playwright/test";
import { abrirMenu } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// CRM dos passageiros (visual v18, issue #446, database/118): grupos prontos com a quantidade,
// a ficha com atalhos, avisos, números e as abas Resumo, Viagens, Pagamentos, Conversa e Cadastro.

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const dia = (n) => {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const base = {
  notes: "",
  bairro_padrao: null,
  total_passagens: 1,
  cancelamentos: 0,
  nao_compareceu: 0,
  reservas_total: 1,
  proxima_data: null,
  a_receber: 0,
  a_receber_qtd: 0,
  frequente: false,
  novo: false,
  sumiu: false,
  sem_nome: false,
  viagens_90d: 1,
  cliente_desde: "2026-03-01T10:00:00Z",
  tags: [],
};
const STATS = [
  {
    ...base,
    customer_id: "c-dev",
    nome: "Rita Devendo",
    telefone: "98990000001",
    viagens_count: 8,
    total_gasto: "640.00",
    ultima_viagem: dia(-3),
    ultima_data: dia(-3),
    a_receber: 140,
    a_receber_qtd: 2,
    frequente: true,
    viagens_90d: 8,
  },
  {
    ...base,
    customer_id: "c-sum",
    nome: "Saulo Sumido",
    telefone: "98990000002",
    viagens_count: 6,
    total_gasto: "480.00",
    ultima_viagem: dia(-45),
    ultima_data: dia(-45),
    sumiu: true,
  },
  {
    ...base,
    customer_id: "c-sem",
    nome: "",
    telefone: "98990000003",
    viagens_count: 1,
    total_gasto: "80.00",
    ultima_viagem: dia(-2),
    ultima_data: dia(-2),
    sem_nome: true,
    novo: true,
  },
];
const viagem = (id, data, campos = {}) => ({
  id,
  customer_id: "c-dev",
  nome: "Rita Devendo",
  telefone: "98990000001",
  data,
  direcao: "ida",
  pontoId: "rodoviaria",
  quantidade: 1,
  valorUnit: 70,
  valorTotal: 70,
  pagamento: "pix",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  criadoEm: new Date().toISOString(),
  ...campos,
});

async function abrirPassageiros(page, opts = {}) {
  await mockSupabase(page, {
    role: "admin",
    customersStats: STATS,
    reservations: [
      viagem("v1", dia(-10)),
      viagem("v2", dia(-3), { direcao: "volta", pontoId: "pirapemas" }),
      viagem("v3", dia(-17), { pago: true }),
    ],
    ...opts,
  });
  await page.goto("/");
  await abrirMenu(page, "Passageiros");
  await expect(page.getByTestId("total-de-passageiros")).toContainText("3 passageiros");
}

test("CRM: grupos com a quantidade filtram a lista", async ({ page }) => {
  await abrirPassageiros(page);
  const grupos = page.getByRole("group", { name: "Grupos de passageiros" });
  await expect(grupos.getByRole("button", { name: /^Sumiram/ })).toContainText("1");
  await expect(grupos.getByRole("button", { name: /^Sem pagamento marcado/ })).toContainText("1");
  await expect(page.getByTestId("numeros-dos-passageiros")).toContainText("R$ 140,00");

  await grupos.getByRole("button", { name: /^Sumiram/ }).click();
  await expect(page.getByText(/não viajam há mais de 30 dias/)).toBeVisible();
  await expect(page.getByTestId("total-de-passageiros")).toContainText("1 passageiro");
  await expect(page.getByRole("button", { name: /Saulo Sumido/ })).toContainText("sem viajar");

  await grupos.getByRole("button", { name: /^Sem nome/ }).click();
  await expect(page.getByRole("button", { name: /Sem nome/ }).last()).toContainText("98990000003");

  // ordenar abre uma folha com as ordens
  await page.getByRole("button", { name: "Ordenar a lista" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nome" }).click();
  await expect(page.getByRole("button", { name: "Ordenar a lista" })).toContainText("Nome");
});

test("CRM: a ficha mostra o aviso, os números e marca pago", async ({ page }) => {
  const edicoes = [];
  await abrirPassageiros(page, {
    onEdit: (route) => edicoes.push(route.request().postDataJSON()),
  });
  await page.getByRole("button", { name: /Rita Devendo/ }).click();
  const ficha = page.getByRole("dialog", { name: /Ficha do passageiro/ });
  await expect(ficha.getByRole("heading", { name: "Rita Devendo" })).toBeVisible();
  await expect(ficha.getByText("Frequente", { exact: true })).toBeVisible();
  await expect(ficha.getByText(/R\$\s?140,00 sem pagamento marcado/)).toBeVisible();
  await expect(ficha.getByRole("button", { name: "Agendar Ida" })).toBeVisible();
  await expect(ficha.getByRole("link", { name: /Ligar/ })).toHaveAttribute(
    "href",
    "tel:98990000001",
  );

  // o aviso leva à aba Pagamentos; marcar pago chama a edição da reserva
  await ficha.getByRole("button", { name: "Ver", exact: true }).click();
  await expect(ficha.getByRole("tab", { name: /Pagamentos/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await ficha.getByRole("button", { name: "Marcar pago" }).first().click();
  await expect.poll(() => edicoes.length).toBe(1);
  expect(edicoes[0].p_paid).toMatchObject({ paid: true, amount: 70, method: "pix" });
  await expect(ficha.getByRole("button", { name: "Marcar pago" })).toHaveCount(1);
});

test("CRM: a aba Conversa mostra o WhatsApp e os avisos enviados", async ({ page }) => {
  await abrirPassageiros(page);
  await page.getByRole("button", { name: /Rita Devendo/ }).click();
  const ficha = page.getByRole("dialog", { name: /Ficha do passageiro/ });
  await ficha.getByRole("tab", { name: "Conversa" }).click();
  await expect(ficha.getByTestId("conversa-do-passageiro")).toContainText("Tem vaga pra quarta?");
  await expect(ficha.getByText(/Confirmar viagem/)).toBeVisible();
  await expect(ficha.getByText(/respondeu SIM/)).toBeVisible();
});
