import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Assistente da equipe (issue #288): conversa, proposta em cartão e gravação
// só depois do "Confirmar".

async function abrirAssistente(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  let aba = page.getByRole("button", { name: "Assistente" });
  if ((await aba.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
    aba = page.getByRole("button", { name: "Assistente" });
  }
  await aba.first().click();
}

test("Assistente: propõe a reserva e só grava depois do Confirmar", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const pedidos = [];
  await page.route("**/functions/v1/assistente", async (route) => {
    const body = route.request().postDataJSON();
    pedidos.push(body);
    if (body.modo === "executar") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Reserva lançada na Agenda." }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        texto: "Preparei a reserva. Confira o cartão.",
        acoes: [
          {
            id: "acao-1",
            tipo: "criar",
            descricao:
              "Volta 11/11 · Zequinha (9884101897)\n1 × Cantanhede, Rua do Cajueiro → Rodoviária\nR$ 60,00 cada · dinheiro",
            aviso: null,
          },
        ],
      }),
    });
  });

  await abrirAssistente(page);
  await expect(page.getByText("Exemplos")).toBeVisible();

  await page
    .getByLabel("Pedido para o assistente")
    .fill("agende o Zequinha amanhã, volta de Cantanhede");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(page.getByText("Preparei a reserva. Confira o cartão.")).toBeVisible();
  await expect(page.getByText(/Zequinha \(9884101897\)/)).toBeVisible();
  // ainda não gravou nada
  expect(pedidos.filter((p) => p.modo === "executar")).toHaveLength(0);
  expect(pedidos[0].mensagens.at(-1)).toEqual({
    papel: "usuario",
    texto: "agende o Zequinha amanhã, volta de Cantanhede",
  });

  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Reserva lançada na Agenda.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
  const gravou = pedidos.filter((p) => p.modo === "executar");
  expect(gravou).toHaveLength(1);
  expect(gravou[0].acao.id).toBe("acao-1");
});

test("Assistente: erro do servidor aparece e Descartar não grava", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  let chamadas = 0;
  await page.route("**/functions/v1/assistente", async (route) => {
    chamadas += 1;
    if (chamadas === 1) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "O assistente atingiu o teto de gasto do mês (US$ 20).",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        texto: "Posso cancelar esta?",
        acoes: [
          { id: "acao-2", tipo: "cancelar", descricao: "Cancelar: Ida 12/11 · Maria", aviso: null },
        ],
      }),
    });
  });

  await abrirAssistente(page);
  const campo = page.getByLabel("Pedido para o assistente");
  await campo.fill("cancele a ida da Maria");
  await campo.press("Enter");
  await expect(page.getByText(/teto de gasto do mês/)).toBeVisible();

  await campo.fill("cancele a ida da Maria");
  await campo.press("Enter");
  await expect(page.getByText("Cancelar: Ida 12/11 · Maria")).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByText(/Descartada/)).toBeVisible();
  expect(chamadas).toBe(2);
});
