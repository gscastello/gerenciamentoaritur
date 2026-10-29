import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #218: Sistema → Bot → "Aprendizado do bot" — o bot observa as conversas
// (em qualquer modo) e propõe lições; o dono revisa (aprovar, editar, recusar),
// vê o que ele anotou dos clientes recorrentes e pode mandar aprender na hora.

const LICOES = [
  {
    id: "l-fato",
    kind: "fato",
    title: "Bagagem de mão sem custo",
    content: "O atendente informa que uma bolsa de mão não é cobrada.",
    status: "proposta",
    needs_review: true,
    evidence_count: 3,
    last_seen_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    id: "l-ling",
    kind: "linguagem_cliente",
    title: "Pedem 'pra amanhã cedo'",
    content: "Dizem 'pra amanhã cedo' querendo a viagem do dia seguinte de manhã.",
    status: "ativa",
    needs_review: true,
    evidence_count: 5,
    last_seen_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: "l-uso",
    kind: "estilo_atendente",
    title: "Confirma repetindo o resumo",
    content: "Antes de fechar, o atendente repete data, ponto e quantidade.",
    status: "ativa",
    needs_review: false,
    evidence_count: 8,
    last_seen_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: "l-neg",
    kind: "negocio",
    title: "Busca em casa antes da rodoviária",
    content: "A van passa nas casas dos clientes e depois segue para a rodoviária.",
    status: "proposta",
    needs_review: true,
    evidence_count: 2,
    last_seen_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
  {
    id: "l-sit",
    kind: "situacao",
    title: "Cliente pede desconto",
    content: "O atendente explica que o valor é fixo e oferece a viagem de ida e volta.",
    status: "ativa",
    needs_review: true,
    evidence_count: 4,
    last_seen_at: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  },
  {
    id: "l-rec",
    kind: "fluxo_agendamento",
    title: "Pede o CPF",
    content: "Lição recusada pelo dono em outra revisão.",
    status: "recusada",
    needs_review: false,
    evidence_count: 1,
    last_seen_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

const STATS = {
  success: true,
  observacoes: 128,
  pendentes: 12,
  ultima_observacao: new Date().toISOString(),
  ultimo_aprendizado: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  dias_guardados: 90,
};

const NOTAS = [
  {
    id: "n-1",
    customer_id: "c-1",
    customer_name: "Dona Raimunda",
    notes: "Costuma embarcar na Rodoviária às sextas, quase sempre com duas pessoas.",
    status: "ativa",
    evidence_count: 3,
    last_seen_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
];

async function abrirAprendizado(page, opts = {}) {
  await mockSupabase(page, {
    role: "admin",
    botLearnings: LICOES,
    botCustomerNotes: NOTAS,
    botStats: STATS,
    ...opts,
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Aprendizado do bot")).toBeVisible();
}

test("mostra os números e separa 'para revisar' de 'valendo no bot'", async ({ page }) => {
  await abrirAprendizado(page);
  await expect(page.getByText("mensagens observadas", { exact: false })).toContainText("128");
  await expect(page.getByText("Para você revisar (4)")).toBeVisible();
  await expect(page.getByText("Valendo no bot (1)")).toBeVisible();
  await expect(page.getByText("Bagagem de mão sem custo")).toBeVisible();
  // funcionamento da empresa e respostas por situação também aparecem para conferir
  await expect(page.getByText("Busca em casa antes da rodoviária")).toBeVisible();
  await expect(page.getByText("Cliente pede desconto")).toBeVisible();
  await expect(page.getByText("Confirma repetindo o resumo")).toBeVisible();
  // recusadas ficam escondidas até pedir
  await expect(page.getByText("Pede o CPF")).toHaveCount(0);
  await page.getByRole("button", { name: /Ver recusadas e desativadas \(1\)/ }).click();
  await expect(page.getByText("Pede o CPF")).toBeVisible();
});

test("aprovar uma informação (fato) grava status ativa e ela passa a valer", async ({ page }) => {
  const gravacoes = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/bot_learnings")) {
      gravacoes.push({ url: r.url(), corpo: r.postDataJSON?.() });
    }
  });
  await abrirAprendizado(page);
  await page.getByRole("button", { name: "Aprovar Bagagem de mão sem custo" }).click();

  await expect.poll(() => gravacoes[0]?.corpo?.status).toBe("ativa");
  expect(gravacoes[0].url).toContain("id=eq.l-fato");
  expect(gravacoes[0].corpo.needs_review).toBe(false);
  await expect(page.getByText("Valendo no bot (2)")).toBeVisible();
  await expect(page.getByText("Para você revisar (3)")).toBeVisible();
});

test("aprovar o funcionamento da empresa (negócio) faz a lição passar a valer", async ({
  page,
}) => {
  await abrirAprendizado(page);
  await page.getByRole("button", { name: "Aprovar Busca em casa antes da rodoviária" }).click();
  await expect(page.getByText("Valendo no bot (2)")).toBeVisible();
});

test("'Está certo' confirma uma lição que já valia; recusar tira de uso", async ({ page }) => {
  await abrirAprendizado(page);
  await page.getByRole("button", { name: "Está certo: Pedem 'pra amanhã cedo'" }).click();
  await expect(page.getByText("Valendo no bot (2)")).toBeVisible();

  await page.getByRole("button", { name: "Recusar Bagagem de mão sem custo" }).click();
  await expect(page.getByText("Para você revisar (2)")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ver recusadas e desativadas \(2\)/ }),
  ).toBeVisible();
});

test("editar o texto da lição salva e mantém ela valendo", async ({ page }) => {
  const gravacoes = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/bot_learnings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await abrirAprendizado(page);
  await page.getByRole("button", { name: "Editar Confirma repetindo o resumo" }).click();
  await page
    .getByLabel("O que o bot aprendeu")
    .fill("Antes de fechar, o atendente repete data, ponto, quantidade e valor.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect.poll(() => gravacoes[0]?.content).toContain("quantidade e valor");
  expect(gravacoes[0].status).toBe("ativa");
  await expect(page.getByText(/quantidade e valor/)).toBeVisible();
});

test("mostra o que o bot anotou dos clientes recorrentes e deixa editar e desativar", async ({
  page,
}) => {
  const gravacoes = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/bot_customer_notes")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await abrirAprendizado(page);
  await expect(page.getByText("Dona Raimunda")).toHaveCount(0);
  await page.getByRole("button", { name: /Ver clientes recorrentes \(1\)/ }).click();
  await expect(page.getByText("Dona Raimunda")).toBeVisible();
  await expect(page.getByText(/Costuma embarcar na Rodoviária às sextas/)).toBeVisible();

  await page.getByRole("button", { name: "Editar anotação de Dona Raimunda" }).click();
  await page
    .getByLabel("Anotação sobre Dona Raimunda")
    .fill("Costuma embarcar na Rodoviária às sextas, sempre com duas pessoas e uma encomenda.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => gravacoes[0]?.notes).toContain("uma encomenda");
  await expect(page.getByText(/uma encomenda/)).toBeVisible();

  await page.getByRole("button", { name: "Desativar anotação de Dona Raimunda" }).click();
  await expect.poll(() => gravacoes[1]?.status).toBe("arquivada");
  await expect(
    page.getByRole("button", { name: "Reativar anotação de Dona Raimunda" }),
  ).toBeVisible();
});

test("'Aprender agora' roda o aprendizado e resume o que foi lido", async ({ page }) => {
  await abrirAprendizado(page, {
    botAprendizadoResumo: {
      observacoes: 40,
      novas: 3,
      reforcos: 2,
      atualizadas: 1,
      clientes: 2,
      ignoradas: 0,
    },
  });
  await page.getByRole("button", { name: "Aprender agora" }).click();
  await expect(
    page.getByText(
      "Li 40 mensagem(ns). 3 lição(ões) nova(s), 2 reforçada(s), 1 atualizada(s), 2 cliente(s) anotado(s).",
    ),
  ).toBeVisible();
});
