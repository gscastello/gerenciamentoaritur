import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #311: Sistema → Bot → "Acerto do bot" — quantas reservas o bot lançou e
// quantas a equipe corrigiu. Issue #310: liga/desliga a confirmação ao cliente.

const ACERTO = {
  success: true,
  dias: 30,
  lancadas: 32,
  corrigidas: 7,
  completadas: 3,
  canceladas: 1,
  acerto: 78,
  correcoes: [
    {
      reserva: "r-1",
      cliente: "Auristelia Coutinho",
      viagem: "11/11 Volta",
      campo: "dia/sentido",
      antes: "12/11 Ida",
      depois: "11/11 Volta",
      tipo: "correcao",
      por: "Gustavo",
      em: "2026-11-11T13:21:09Z",
    },
    {
      reserva: "r-1",
      cliente: "Auristelia Coutinho",
      viagem: "11/11 Volta",
      campo: "embarque",
      antes: "Buscar em Casa",
      depois: "Pirapemas",
      tipo: "correcao",
      por: "Gustavo",
      em: "2026-11-11T13:21:09Z",
    },
  ],
};

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  // a tela Sistema tem abas (issue #397)
  await page.getByRole("button", { name: "Bot", exact: true }).click();
  await expect(page.getByText("Acerto do bot")).toBeVisible();
}

test("Sistema > Bot: mostra o acerto do bot e as correções por reserva", async ({ page }) => {
  const periodos = [];
  await mockSupabase(page, { role: "admin", botAcerto: ACERTO });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_bot_acerto")) periodos.push(r.postDataJSON?.()?.p_dias);
  });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("78%")).toBeVisible();
  await expect(page.getByText(/Acerto baixo/)).toBeVisible();
  await expect(page.getByText("Auristelia Coutinho")).toBeVisible();
  await expect(page.getByText("dia/sentido: 12/11 Ida → 11/11 Volta")).toBeVisible();
  await expect(page.getByText("embarque: Buscar em Casa → Pirapemas")).toBeVisible();

  await page.getByRole("button", { name: "7 dias" }).click();
  await expect.poll(() => periodos.includes(7)).toBe(true);
});

test("Sistema > Bot: sem reservas do bot no período", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirSistema(page);
  await expect(page.getByText("Nenhuma reserva lançada pelo bot neste período.")).toBeVisible();
});

test("Sistema > Bot: desliga a confirmação ao cliente do Agendado", async ({ page }) => {
  const gravacoes = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/settings")) {
      gravacoes.push(r.postDataJSON?.());
    }
  });
  await page.goto("/");
  await abrirSistema(page);

  const chave = page.getByRole("switch", { name: "Confirmar ao cliente a reserva do Agendado" });
  await chave.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await expect(chave).toHaveAttribute("aria-checked", "true");
  await chave.click();
  await expect
    .poll(() => gravacoes.find((g) => g?.key === "agendado_confirmacao")?.value)
    .toEqual({ ativo: false });
});
