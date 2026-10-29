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
  if (Number(p.hour) >= 14) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo;
}

const diaDaSemana = (d) => d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });

async function abrirAgenda(page) {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Dashboard$/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
}

test("Agenda: dia da semana e data ficam em destaque, centralizados", async ({ page }) => {
  await abrirAgenda(page);

  const alvo = diaEsperadoNoOpen();
  const diaSemanaAlvo = diaDaSemana(alvo);

  const tituloDia = page.getByText(diaSemanaAlvo, { exact: true });
  await expect(tituloDia).toBeVisible();

  const fontSize = await tituloDia.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(24); // bem maior que o texto normal (14px)
});

test("Agenda: setas avançam e voltam um dia por vez", async ({ page }) => {
  await abrirAgenda(page);

  const alvo = diaEsperadoNoOpen();
  const proximo = new Date(alvo);
  proximo.setUTCDate(proximo.getUTCDate() + 1);
  const diaSemanaAlvo = diaDaSemana(alvo);
  const diaSemanaProximo = diaDaSemana(proximo);

  await page.getByRole("button", { name: "Próximo dia" }).click();
  await expect(page.getByText(diaSemanaProximo, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(page.getByText(diaSemanaAlvo, { exact: true }).first()).toBeVisible();
});
