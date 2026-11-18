import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #455: o "Agendado ☑️" que não lançou aparece numa faixa fixa no topo de todas as telas de
// quem agenda, leva às Pendências e some quando a pendência é resolvida (dados fictícios).

const AGENDADO = {
  id: "tkt-agendado",
  source: "whatsapp",
  phone: "5598900001111",
  customer_id: null,
  assunto: "Agendado ☑️ não lançou",
  detail:
    "Motivo: o dia da viagem não aparece na conversa. Confira a conversa e lance pela Agenda (ou por Atendimento → Reservas prontas).",
  status: "aberta",
  meta: {},
  created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  cliente: "Maria Teste",
  aberto_por: null,
};

const OUTRA = {
  ...AGENDADO,
  id: "tkt-outra",
  assunto: "Cliente pediu para falar com atendente",
  detail: "Quer trocar a data",
  cliente: "João Teste",
};

test("Agendado sem reserva: faixa no topo, leva às Pendências e some ao resolver", async ({
  page,
}) => {
  await mockSupabase(page, { role: "atendente", pendencias: [AGENDADO, OUTRA] });
  await page.goto("/");
  const faixa = page.getByTestId("aviso-agendado-sem-reserva");
  await expect(faixa).toBeVisible();
  await expect(faixa).toContainText(
    "1 passageiro marcado como Agendado ☑️ ainda não tem lugar na Agenda",
  );
  await expect(faixa).toContainText("Maria Teste");
  await expect(faixa).toContainText("O dia da viagem não aparece na conversa");
  await expect(faixa).not.toContainText("João Teste");

  await faixa.getByRole("button", { name: /Resolver agora/ }).click();
  const resolver = page.getByRole("button", { name: "Resolver", exact: true });
  const card = page
    .locator("div")
    .filter({ hasText: "Agendado ☑️ não lançou" })
    .filter({ has: resolver })
    .last();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(page.getByText("Agendado ☑️ não lançou")).toHaveCount(0);
  await expect(faixa).toHaveCount(0);
});

test("Agendado sem reserva: o motorista não vê a faixa", async ({ page }) => {
  await mockSupabase(page, { role: "motorista", pendencias: [AGENDADO] });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Agenda$/ }).first()).toBeVisible();
  await expect(page.getByTestId("aviso-agendado-sem-reserva")).toHaveCount(0);
});
