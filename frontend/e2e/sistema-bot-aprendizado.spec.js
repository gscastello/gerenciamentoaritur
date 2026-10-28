import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #218: Sistema → Bot → "Aprendizado do modo Sombra" — o bot observa as
// conversas e propõe lições; o dono revisa (aprovar, editar, recusar) e pode
// mandar aprender na hora.

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

async function abrirAprendizado(page, opts = {}) {
  await mockSupabase(page, {
    role: "admin",
    botLearnings: LICOES,
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
  await expect(page.getByText("Aprendizado do modo Sombra")).toBeVisible();
}

test("mostra os números e separa 'para revisar' de 'valendo no bot'", async ({ page }) => {
  await abrirAprendizado(page);
  await expect(page.getByText("mensagens observadas", { exact: false })).toContainText("128");
  await expect(page.getByText("Para você revisar (2)")).toBeVisible();
  await expect(page.getByText("Valendo no bot (1)")).toBeVisible();
  await expect(page.getByText("Bagagem de mão sem custo")).toBeVisible();
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
  await expect(page.getByText("Para você revisar (1)")).toBeVisible();
});

test("'Está certo' confirma uma lição que já valia; recusar tira de uso", async ({ page }) => {
  await abrirAprendizado(page);
  await page.getByRole("button", { name: "Está certo: Pedem 'pra amanhã cedo'" }).click();
  await expect(page.getByText("Valendo no bot (2)")).toBeVisible();

  await page.getByRole("button", { name: "Recusar Bagagem de mão sem custo" }).click();
  await expect(page.getByText("Para você revisar (0)")).toBeVisible();
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

test("'Aprender agora' roda o aprendizado e resume o que foi lido", async ({ page }) => {
  await abrirAprendizado(page, {
    botAprendizadoResumo: { observacoes: 40, novas: 3, reforcos: 2, atualizadas: 1, ignoradas: 0 },
  });
  await page.getByRole("button", { name: "Aprender agora" }).click();
  await expect(
    page.getByText("Li 40 mensagem(ns). 3 lição(ões) nova(s), 2 reforçada(s), 1 atualizada(s)."),
  ).toBeVisible();
});
