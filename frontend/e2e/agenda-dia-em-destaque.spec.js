import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Redesenho da Agenda (pedido do dono, 2026-09-21): o dia da semana e a
// data viram o elemento central da tela, com setas pra andar dia a dia
// sem precisar abrir o seletor de data. A troca automática pro dia
// seguinte depois das 14h (fim da volta pra São Luís) é testada à parte,
// via mock de horário, em src/app/__tests__/diaAgendaPadrao.test.js — o
// helper abaixo só espelha essa mesma regra pra saber qual dia esperar
// aqui, já que o horário real de quando o e2e roda varia.

const FUSO = "America/Fortaleza";
// O dia é o do calendário de Fortaleza (não o do fuso de quem roda o teste: o CI
// roda em UTC e, entre 21h e 24h daqui, o dia de lá já é o seguinte). Devolve
// uma data ao meio-dia UTC com esse dia, para ler o dia da semana com
// timeZone "UTC".
function diaEsperadoNoOpen() {
  const agora = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  const alvo = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 12));
  // o relógio dos testes fica às 6h (mockSupabase): a Agenda abre no próprio dia
  return alvo;
}

const diaDaSemana = (d) => d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });

async function abrirAgenda(page) {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
}

const iso = (d) => d.toISOString().slice(0, 10);

const somar = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

// Visual v18 (issue #446): o dia escolhido fica embaixo de "Agenda" ("Hoje, 16 de novembro"), a
// semana inteira fica no topo com a lotação de cada dia e o mês abre num calendário.
test("Agenda: o topo mostra o dia certo (Hoje/Amanhã) e a semana dele", async ({ page }) => {
  await abrirAgenda(page);
  const alvo = diaEsperadoNoOpen();
  const titulo = page.getByTestId("dia-da-agenda").filter({ visible: true });
  await expect(titulo).toHaveAttribute("data-dia", iso(alvo));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
  await expect(titulo).toContainText(iso(alvo) === hoje ? "Hoje" : "Amanhã");
  // a semana vai de segunda a domingo e o dia escolhido fica marcado
  const semana = page.getByTestId("semana-da-agenda");
  await expect(semana.getByRole("button")).toHaveCount(7);
  await expect(semana.locator(`[data-dia="${iso(alvo)}"]`)).toHaveAttribute("aria-pressed", "true");
  const segunda = somar(alvo, -((alvo.getUTCDay() + 6) % 7));
  await expect(semana.getByRole("button").first()).toHaveAttribute("data-dia", iso(segunda));
});

test("Agenda: tocar num dia da semana leva a Agenda para ele", async ({ page }) => {
  await abrirAgenda(page);
  const alvo = diaEsperadoNoOpen();
  const outro = alvo.getUTCDay() === 0 ? somar(alvo, -1) : somar(alvo, 1);
  await page
    .getByTestId("semana-da-agenda")
    .locator(`[data-dia="${iso(outro)}"]`)
    .click();
  const titulo = page.getByTestId("dia-da-agenda").filter({ visible: true });
  await expect(titulo).toHaveAttribute("data-dia", iso(outro));
  await expect(titulo).toContainText(
    iso(outro) === iso(somar(alvo, 1)) ? "Amanhã" : diaDaSemana(outro).slice(0, 3),
    { ignoreCase: true },
  );
});

test("Agenda: o calendário do mês leva a outro mês e volta para hoje", async ({ page }) => {
  await abrirAgenda(page);
  const alvo = diaEsperadoNoOpen();
  await page
    .getByRole("button", { name: "Abrir o calendário do mês" })
    .filter({ visible: true })
    .click();
  const cal = page.getByTestId("calendario-do-mes");
  await expect(cal.getByRole("heading", { name: "Escolher o dia" })).toBeVisible();
  await expect(cal.locator(`[data-dia="${iso(alvo)}"]`)).toHaveAttribute("aria-pressed", "true");
  // no mês seguinte, o dia 10
  await cal.getByRole("button", { name: "Próximo mês" }).click();
  const proximoMes = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 10, 12));
  await cal.locator(`[data-dia="${iso(proximoMes)}"]`).click();
  await expect(cal).toHaveCount(0);
  const titulo = page.getByTestId("dia-da-agenda").filter({ visible: true });
  await expect(titulo).toHaveAttribute("data-dia", iso(proximoMes));
  // fora da semana de hoje aparece o atalho; o calendário também volta
  await page
    .getByRole("button", { name: "Abrir o calendário do mês" })
    .filter({ visible: true })
    .click();
  await page
    .getByTestId("calendario-do-mes")
    .getByRole("button", { name: "Voltar para hoje" })
    .click();
  await expect(titulo).toHaveAttribute("data-dia", iso(alvo));
});
