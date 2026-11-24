import { expect, test } from "@playwright/test";
import { MICROFONE_FALSO } from "./support/microfone.js";
import { abrirMenu, abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Assistente em qualquer tela, pendências, voz e correções para o Claude (issue #516).

const responder = (route, corpo) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, ...corpo }),
  });

const PENDENCIA = {
  id: "p-1",
  source: "whatsapp",
  phone: "98999998888",
  customer_id: null,
  assunto: "Agendado não lançou",
  detail: "o cliente escreveu 2 passagens e a reserva ficou com 3",
  status: "aberta",
  meta: {},
  created_at: new Date().toISOString(),
  cliente: "Maria",
  aberto_por: null,
};

async function comPendencia(page) {
  await page.route("**/rest/v1/v_pendencias_atendimento**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([PENDENCIA]),
    }),
  );
}

test("Assistente: o botão está em todas as telas e abre por cima, sem perder a tela", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  for (const menu of ["Agenda", "Rota", "Atendimento", "Início"]) {
    await abrirMenu(page, menu);
    await expect(page.getByTestId("botao-assistente")).toBeVisible();
  }
  await page.getByTestId("botao-assistente").click();
  const folha = page.getByRole("dialog", { name: "Assistente" });
  await expect(folha).toBeVisible();
  await folha.getByRole("button", { name: "Fechar o assistente" }).click();
  await expect(folha).toHaveCount(0);
});

for (const largura of [320, 390, 430]) {
  test(`Assistente: cabe em ${largura} px e o campo não dá zoom no iPhone`, async ({ page }) => {
    await mockSupabase(page, { role: "admin" });
    await comPendencia(page);
    await page.setViewportSize({ width: largura, height: 844 });
    await page.goto("/");
    await page.getByTestId("botao-assistente").click();
    await expect(page.getByText("Resolver a pendência mais nova")).toBeVisible();
    const sobra = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Assistente"]');
      return [...d.querySelectorAll("*")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1;
      }).length;
    });
    expect(sobra).toBe(0);
    const fonte = await page
      .getByLabel("Pedido para o assistente")
      .evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
    expect(fonte).toBeGreaterThanOrEqual(16);
    const caixa = await page.getByRole("dialog", { name: "Assistente" }).boundingBox();
    expect(Math.round(caixa.height)).toBe(844);
  });
}

test("Pendências: resolve com o assistente e só depois sai da lista", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await comPendencia(page);
  const pedidos = [];
  await page.route("**/functions/v1/assistente", (route) => {
    const b = route.request().postDataJSON();
    pedidos.push(b);
    if (b.modo === "executar") return responder(route, { message: "Reserva lançada." });
    return responder(route, {
      texto: "Eram 2 adultos e uma criança de colo.",
      acoes: [{ id: "a1", tipo: "criar", descricao: "Volta 30/11 · Maria\n2 × Pirapemas" }],
    });
  });
  const resolvidas = [];
  await page.route("**/rest/v1/rpc/rpc_resolve_support_ticket", (route) => {
    resolvidas.push(route.request().postDataJSON().p_id);
    return responder(route, {});
  });
  await page.goto("/");
  await abrirTela(page, "pendencias");
  await page.getByRole("button", { name: "Resolver com o assistente" }).click();
  await expect(page.getByText("Eram 2 adultos e uma criança de colo.")).toBeVisible();
  const fala = pedidos[0].mensagens.at(-1).texto;
  expect(fala).toContain("Resolva a pendência: Agendado não lançou");
  expect(fala).toContain("pendência id p-1");
  expect(fala).toContain("a reserva ficou com 3");
  expect(resolvidas).toEqual([]);
  const fechar = page.getByRole("button", { name: /tirar a pendência da lista/ });
  await expect(fechar).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Reserva lançada.")).toBeVisible();
  await fechar.click();
  await expect.poll(() => resolvidas).toEqual(["p-1"]);
  expect(pedidos.filter((p) => p.modo === "conversar")).toHaveLength(1);
});

test("Assistente: o erro explicado fica registrado para o Claude e pode sair da fila", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.route("**/functions/v1/assistente", (route) =>
    responder(route, {
      texto: "Anotado.",
      correcoes: [
        { id: "c1", o_que_errou: "Leu Peris como Pirapemas", o_certo: "Ida de Periz em Outros" },
      ],
    }),
  );
  const mudancas = [];
  await page.route("**/rest/v1/bot_correcoes**", (route) => {
    if (route.request().method() === "PATCH") mudancas.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/");
  await page.getByTestId("botao-assistente").click();
  await page.getByRole("button", { name: "Contar um erro" }).click();
  const campo = page.getByLabel("Pedido para o assistente");
  await expect(campo).toHaveValue("O bot errou: ");
  await campo.press("End");
  await campo.pressSequentially("era Periz");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Registrado para o Claude corrigir", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tirar da fila do Claude" }).click();
  await expect(page.getByText("Tirada da fila do Claude")).toBeVisible();
  expect(mudancas[0].status).toBe("descartada");
});

test("Assistente por voz: a fala vira pedido e o sim confirma a proposta", async ({ page }) => {
  await page.addInitScript(MICROFONE_FALSO);
  await mockSupabase(page, { role: "admin" });
  const falas = ["cancele a ida da Maria", "Sim."];
  const pedidos = [];
  await page.route("**/functions/v1/assistente", (route) => {
    const b = route.request().postDataJSON();
    pedidos.push(b);
    if (b.modo === "transcrever") return responder(route, { texto: falas.shift() });
    if (b.modo === "executar") return responder(route, { message: "Reserva cancelada." });
    return responder(route, {
      texto: "Vou cancelar.",
      acoes: [{ id: "a1", tipo: "cancelar", descricao: "Cancelar: Ida 25/11 · Maria" }],
    });
  });
  await page.goto("/");
  await page.getByTestId("botao-assistente").click();
  const falar = async () => {
    await page.getByRole("button", { name: "Falar o pedido" }).click();
    await expect(page.getByRole("status", { name: "Ouvindo" })).toBeVisible();
    await page.getByRole("button", { name: "Terminar a fala" }).click();
  };
  await falar();
  await expect(page.getByText("cancele a ida da Maria")).toBeVisible();
  await expect(page.getByText("Cancelar: Ida 25/11 · Maria")).toBeVisible();
  expect(pedidos.some((p) => p.modo === "executar")).toBe(false);
  await falar();
  await expect(page.getByText("Reserva cancelada.")).toBeVisible();
  expect(pedidos[0].tipo).toBe("audio/mp4");
  // o microfone é desligado a cada fala
  expect(await page.evaluate(() => window.__MICROFONES_DESLIGADOS__)).toBe(2);
  // cancelar a fala não manda nada
  const antes = pedidos.length;
  await page.getByRole("button", { name: "Falar o pedido" }).click();
  await page.getByRole("button", { name: "Cancelar a fala" }).click();
  await expect(page.getByRole("button", { name: "Falar o pedido" })).toBeVisible();
  expect(pedidos.length).toBe(antes);
});
