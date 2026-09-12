import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Sem sessão, o que renderiza é a tela de login. O que dá para verificar
// de fora aqui é a regra inegociável do AGENTS.md §5: com
// prefers-reduced-motion, nada anima.

test("prefers-reduced-motion desliga as animações (login + app)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Gestão AriTur")).toBeVisible();

  const semSessao = await page.evaluate(() =>
    [...document.querySelectorAll("*")].some((el) => {
      const d = getComputedStyle(el).animationDuration;
      return d && d !== "0s" && Number.parseFloat(d) > 0.05;
    }),
  );
  expect(semSessao).toBe(false);
  await context.close();

  // agora autenticado, com os heros animados na tela
  const ctx2 = await browser.newContext({ reducedMotion: "reduce" });
  const p2 = await ctx2.newPage();
  await mockSupabase(p2, { role: "admin", occupancy: {} });
  await p2.goto("/");
  await p2.getByRole("button", { name: /^Agenda$/ }).first().click();
  await expect(p2.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await expect
    .poll(() => p2.evaluate(() => document.documentElement.dataset.motion))
    .toBe("off");
  const comSessao = await p2.evaluate(() => {
    const hero = document.querySelector(".aritur-hero");
    const beforeDur = hero
      ? Number.parseFloat(getComputedStyle(hero, "::before").animationDuration)
      : 0;
    const some = [...document.querySelectorAll("*")].some(
      (el) => Number.parseFloat(getComputedStyle(el).animationDuration) > 0.05,
    );
    return beforeDur > 0.05 || some;
  });
  expect(comSessao).toBe(false);
  await ctx2.close();
});

// O usuário pode forçar as animações mesmo com o sistema pedindo menos
// movimento (aba Sistema → Movimento → "Ligado"). data-motion="on".
test('preferência "Ligado" reativa as animações mesmo com reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aritur-motion", "on");
    } catch {}
  });
  await mockSupabase(page, { role: "admin", occupancy: {} });
  await page.goto("/");
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.motion))
    .toBe("on");
  // com data-motion="on", a estrada/faixas animadas dos heros voltam a rodar
  const anyAnimating = await page.evaluate(() => {
    const hero = document.querySelector(".aritur-hero");
    const beforeDur = hero
      ? Number.parseFloat(getComputedStyle(hero, "::before").animationDuration)
      : 0;
    const some = [...document.querySelectorAll("*")].some(
      (el) => Number.parseFloat(getComputedStyle(el).animationDuration) > 0.05,
    );
    return beforeDur > 0.05 || some;
  });
  expect(anyAnimating).toBe(true);
  await context.close();
});

// Regressão: as classes de entrada que envolvem o CONTEÚDO real de cada aba
// (.anim-fadeIn embrulha a aba inteira; .anim-fadeUp/.anim-pop/
// .anim-slideDown/.stagger embrulham cards e listas) só ficavam com a
// duração encurtada pra ~0 com "Desligado" — em alguns motores móveis isso
// não é suficiente (a camada composta em will-change pode ficar presa no
// frame inicial, opacity:0, "sumindo" com os dados). Precisam de
// animation:none de verdade, não só duração ~0.
test("Desligado: classes de entrada do conteúdo usam animation:none (não só duração ~0)", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-motion-1",
        data: hoje,
        direcao: "ida",
        pontoId: "rodoviaria",
        nome: "Cliente Motion E2E",
        telefone: "98999990000",
        quantidade: 2,
        valorUnit: 60,
        valorTotal: 120,
        pagamento: "dinheiro",
        status: "confirmada",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        buscaPor: "taxi",
        criadoEm: new Date().toISOString(),
      },
    ],
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aritur-motion", "off");
    } catch {}
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.motion))
    .toBe("off");

  await page.getByRole("button", { name: /Lista do Dia/ }).first().click();
  // a reserva mockada precisa continuar visível — é o que sumia (issue relatada)
  await expect(page.getByText("Cliente Motion E2E")).toBeVisible();

  const wrapperOk = await page.evaluate(() => {
    const el = document.querySelector(".anim-fadeIn");
    if (!el) return false;
    return getComputedStyle(el).animationName === "none";
  });
  expect(wrapperOk).toBe(true);
});
