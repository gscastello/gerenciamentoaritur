import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
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
  {
    id: "q1",
    question: "Vocês aceitam animal de estimação?",
    reason: "fora da base",
    created_at: AGORA,
  },
];

async function abrirAtendimento(page, tela = "atendimento") {
  await abrirTela(page, tela);
  if (tela !== "pendencias") await expect(page.getByText("Atendimento WhatsApp")).toBeVisible();
}

test("Atendimento: fila mostra o nome do cadastro ao lado do perfil do WhatsApp", async ({
  page,
}) => {
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

  await expect(page.getByRole("tab", { name: "Aguardando 1" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Com a equipe 1" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Com o bot 1" })).toBeVisible();

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
  await page.getByRole("tab", { name: /^Pendências/ }).click();
  await expect(page.getByText("Nenhuma pendência aberta.")).toBeVisible();
  await page.getByRole("tab", { name: /^Bot/ }).click();
  await expect(page.getByText("Nenhuma pergunta pendente.")).toBeVisible();
});

test("Atendimento: resolve uma pendência direto do painel", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", pendencias: [PENDENCIA] });
  await page.goto("/");
  await abrirAtendimento(page, "pendencias");

  await expect(page.getByText("Cliente pediu atendente no WhatsApp")).toBeVisible();
  await page.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(page.getByText("Cliente pediu atendente no WhatsApp")).toHaveCount(0);
});

test("Atendimento: cadastra a resposta de uma pergunta sem resposta na base do bot", async ({
  page,
}) => {
  const criados = [];
  await mockSupabase(page, { role: "admin", botUnanswered: PERGUNTAS });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/bot_knowledge")) {
      criados.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirAtendimento(page, "bot");

  await expect(page.getByText(/Vocês aceitam animal de estimação/)).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar resposta" }).click();
  await page.getByLabel("Assunto").fill("Animais de estimação");
  await page
    .getByLabel("O que o bot deve saber")
    .fill("Pets pequenos viajam na caixa de transporte, sem custo.");
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
  await abrirAtendimento(page, "bot");

  await page.getByRole("button", { name: /Dispensar a pergunta/ }).click();
  await expect(page.getByText(/Vocês aceitam animal de estimação/)).toHaveCount(0);
  expect(criados).toHaveLength(0);
});

// Issue #360: conversa velha marcada como "aguardando" não sobe mais para o topo; a
// janela de Conversas é só a fila, a mais recente primeiro, com filtros.
test("Atendimento: conversas na ordem do WhatsApp; aguardando só vale nas últimas 48 h", async ({
  page,
}) => {
  const velha = new Date(Date.now() - 20 * 86400000).toISOString();
  const conversas = [
    {
      ...CONVERSAS[0],
      conversation_id: "c-velha",
      nome_cadastro: "Cliente de Outubro",
      last_message_at: velha,
    },
    { ...CONVERSAS[1], conversation_id: "c-nova", nome_whatsapp: "Cliente de Agora" },
  ];
  await mockSupabase(page, { role: "admin", atendimento: conversas });
  await page.goto("/");
  await abrirAtendimento(page);

  const fila = page.getByTestId("fila-de-conversas");
  await expect(fila.getByText("Cliente de Agora")).toBeVisible();
  const nomes = await fila.locator(".text-sm.font-medium").allInnerTexts();
  expect(nomes.indexOf("Cliente de Agora")).toBeLessThan(nomes.indexOf("Cliente de Outubro"));
  // a de 20 dias atrás não conta como aguardando
  await expect(page.getByRole("tab", { name: "Aguardando 0" })).toBeVisible();
  await expect(fila.getByText("Aguardando resposta", { exact: true })).toHaveCount(0);

  await page.getByRole("tab", { name: /^Com o bot/ }).click();
  await expect(fila.getByText("Cliente de Agora")).toBeVisible();
  await expect(fila.getByText("Cliente de Outubro")).toHaveCount(0);
  // a janela de conversas é só a fila: nada de pendências nem perguntas aqui
  await expect(page.getByText("Pendências abertas")).toHaveCount(0);
  await expect(page.getByText("Perguntas que o bot não soube responder")).toHaveCount(0);
});
