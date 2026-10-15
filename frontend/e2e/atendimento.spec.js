import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Aba Atendimento (issue #182): substitui o antigo simulador "Reservar". Fila
// espelhada do Chatwoot, pendências e perguntas que o bot não soube responder.

const AGORA = new Date().toISOString();

const CONVERSAS = [
  {
    conversation_id: "c1",
    chatwoot_conversation_id: 55,
    phone: "5598981012388",
    nome_whatsapp: "😎 Maria Top",
    customer_id: "cust-1",
    nome_cadastro: "Maria da Silva",
    status: "open",
    modo: "humano",
    last_message_by: "cliente",
    previa: "Posso levar uma caixa grande?",
    last_message_at: AGORA,
    aguardando_equipe: true,
  },
  {
    conversation_id: "c2",
    chatwoot_conversation_id: 56,
    phone: "5598999990000",
    nome_whatsapp: "Zé do Posto",
    customer_id: null,
    nome_cadastro: null,
    status: "pending",
    modo: "ia",
    last_message_by: "bot",
    previa: "Para qual data você quer viajar?",
    last_message_at: AGORA,
    aguardando_equipe: false,
  },
];

const PENDENCIA = {
  id: "p1",
  source: "whatsapp",
  phone: "5598981012388",
  customer_id: "cust-1",
  assunto: "Cliente pediu atendente no WhatsApp",
  detail: "Cliente pediu atendente.",
  status: "aberta",
  meta: {},
  created_at: AGORA,
  cliente: "Maria da Silva",
  aberto_por: null,
};

const PERGUNTAS = [
  { id: "q1", question: "Vocês aceitam animal de estimação?", reason: "fora da base", created_at: AGORA },
];

async function abrirAtendimento(page) {
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  const aba = page.getByRole("button", { name: /^Atendimento$/ });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Atendimento$/ }).first().click();
  await expect(page.getByText("Atendimento WhatsApp")).toBeVisible();
}

test("Atendimento: fila mostra o nome do cadastro ao lado do perfil do WhatsApp", async ({ page }) => {
  await mockSupabase(page, { role: "admin", atendimento: CONVERSAS });
  await page.goto("/");
  await abrirAtendimento(page);

  // cadastro em destaque; apelido do WhatsApp só como referência
  await expect(page.getByText("Maria da Silva").first()).toBeVisible();
  await expect(page.getByText(/perfil do WhatsApp: 😎 Maria Top/)).toBeVisible();
  await expect(page.getByText("Aguardando resposta", { exact: true })).toBeVisible();
  await expect(page.getByText("Com a equipe", { exact: true })).toBeVisible();

  // sem cadastro: só o nome do perfil, marcado
  await expect(page.getByText("Zé do Posto")).toBeVisible();
  await expect(page.getByText("sem cadastro", { exact: true })).toBeVisible();
  await expect(page.getByText("+55 98 99999-0000")).toBeVisible();
  await expect(page.getByText("Com o bot", { exact: true })).toBeVisible();

  await expect(page.getByText(/1 aguardando resposta · 1 com a equipe · 1 com o bot/)).toBeVisible();

  const link = page.getByRole("link", { name: "Abrir no Chatwoot" }).first();
  await expect(link).toHaveAttribute(
    "href",
    "https://chatwoot.e2e.local/app/accounts/1/conversations/55",
  );
});

test("Atendimento: sem conversas mostra o aviso de fila vazia", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirAtendimento(page);

  await expect(page.getByText(/Nenhuma conversa em andamento/)).toBeVisible();
  await expect(page.getByText("Nenhuma pendência aberta.")).toBeVisible();
  await expect(page.getByText("Nenhuma pergunta pendente.")).toBeVisible();
});

test("Atendimento: resolve uma pendência direto do painel", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", pendencias: [PENDENCIA] });
  await page.goto("/");
  await abrirAtendimento(page);

  await expect(page.getByText("Cliente pediu atendente no WhatsApp")).toBeVisible();
  await page.getByRole("button", { name: /Resolver pendência/ }).click();
  await expect(page.getByText("Cliente pediu atendente no WhatsApp")).toHaveCount(0);
});

test("Atendimento: cadastra a resposta de uma pergunta sem resposta na base do bot", async ({ page }) => {
  const criados = [];
  await mockSupabase(page, { role: "admin", botUnanswered: PERGUNTAS });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/bot_knowledge")) {
      criados.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirAtendimento(page);

  await expect(page.getByText(/Vocês aceitam animal de estimação/)).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar resposta" }).click();
  await page.getByLabel("Assunto").fill("Animais de estimação");
  await page.getByLabel("O que o bot deve saber").fill("Pets pequenos viajam na caixa de transporte, sem custo.");
  await page.getByRole("button", { name: "Salvar na base" }).click();

  await expect.poll(() => criados[0]?.title).toBe("Animais de estimação");
  expect(criados[0].content).toContain("caixa de transporte");
  await expect(page.getByText(/Vocês aceitam animal de estimação/)).toHaveCount(0);
});

test("Atendimento: dispensa uma pergunta sem cadastrar nada", async ({ page }) => {
  const criados = [];
  await mockSupabase(page, { role: "admin", botUnanswered: PERGUNTAS });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/bot_knowledge")) criados.push(1);
  });
  await page.goto("/");
  await abrirAtendimento(page);

  await page.getByRole("button", { name: /Dispensar a pergunta/ }).click();
  await expect(page.getByText(/Vocês aceitam animal de estimação/)).toHaveCount(0);
  expect(criados).toHaveLength(0);
});
