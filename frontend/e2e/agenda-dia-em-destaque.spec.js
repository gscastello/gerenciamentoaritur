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

// Crítica de design (issue #393): o cartão grande do dia saiu; a data fica numa barra com
// setas ("‹ Hoje 13/11 ›"), sem precisar abrir o calendário.
test("Agenda: a barra do dia mostra o dia certo (Hoje/Amanhã) com a data", async ({ page }) => {
  await abrirAgenda(page);
  const alvo = diaEsperadoNoOpen();
  const barra = page.getByTestId("dia-da-agenda");
  await expect(barra.getByLabel("Dia da Agenda")).toHaveValue(iso(alvo));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
  await expect(barra).toContainText(iso(alvo) === hoje ? "Hoje" : "Amanhã");
});

test("Agenda: setas avançam e voltam um dia por vez", async ({ page }) => {
  await abrirAgenda(page);
  const alvo = diaEsperadoNoOpen();
  const proximo = new Date(alvo);
  proximo.setUTCDate(proximo.getUTCDate() + 1);
  const campo = page.getByTestId("dia-da-agenda").getByLabel("Dia da Agenda");

  await page.getByRole("button", { name: "Próximo dia" }).click();
  await expect(campo).toHaveValue(iso(proximo));
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(campo).toHaveValue(iso(alvo));
  // o dia da semana aparece quando não é hoje nem amanhã
  await page.getByRole("button", { name: "Próximo dia" }).click();
  await page.getByRole("button", { name: "Próximo dia" }).click();
  const depois = new Date(alvo);
  depois.setUTCDate(depois.getUTCDate() + 2);
  await expect(page.getByTestId("dia-da-agenda")).toContainText(diaDaSemana(depois).slice(0, 3), {
    ignoreCase: true,
  });
});
