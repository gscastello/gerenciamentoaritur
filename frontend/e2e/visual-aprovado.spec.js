import { expect, test } from "@playwright/test";
import { abrirMenu, abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Visual aprovado pelo dono (issue #391): topo com o AT, o nome da tela e o dia; barra de
// baixo flutuante com a luz deslizando; Início com a capa, o financeiro, Ida e Volta
// separadas e "Precisa de você"; Agenda com o seletor Ida/Volta e a lotação (issue #393).

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("topo mostra o nome da tela e a barra marca a tela atual", async ({ page }) => {
    await mockSupabase(page, { role: "admin" });
    await page.goto("/");
    const topo = page.getByTestId("topo-tela");
    await expect(topo.getByRole("heading", { level: 1 })).toHaveText("Agenda");
    const barra = page.getByTestId("barra-de-baixo");
    await expect(barra.getByRole("button", { name: /Agenda/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const luz = barra.locator(".barra-at-luz");
    const antes = await luz.evaluate((el) => el.style.transform);
    await barra.getByRole("button", { name: /^Início$/ }).click();
    await expect(topo.getByRole("heading", { level: 1 })).toHaveText(
      /^(Bom dia|Boa tarde|Boa noite), /,
    );
    await expect(barra.getByRole("button", { name: /^Início$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect.poll(() => luz.evaluate((el) => el.style.transform)).not.toBe(antes);
  });

  test("Início: capa inteira, financeiro em três cartões, Ida e Volta separadas", async ({
    page,
  }) => {
    await mockSupabase(page, { role: "admin" });
    await page.goto("/");
    await abrirMenu(page, "Início");
    const capa = page.getByTestId("capa-inicio");
    await expect(capa).toBeVisible();
    await expect.poll(() => capa.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    const caixa = await capa.boundingBox();
    // 16:9 inteira, sem corte
    expect(Math.abs(caixa.width / caixa.height - 16 / 9)).toBeLessThan(0.02);
    const fin = page.getByTestId("inicio-financeiro").getByRole("button");
    await expect(fin).toHaveCount(3);
    await expect(fin.nth(0)).toContainText("lucro real");
    // os três na mesma linha
    const ys = await fin.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    expect(new Set(ys).size).toBe(1);
    await expect(page.getByTestId("inicio-ida")).toContainText("IDA");
    await expect(page.getByTestId("inicio-volta")).toContainText("VOLTA");
    await expect(page.getByTestId("precisa-de-voce")).toBeVisible();
    // tocar na Volta abre a Agenda já na Volta
    await page.getByTestId("inicio-volta").click();
    const seletor = page.getByTestId("seletor-sentido");
    await expect(seletor.getByRole("tab", { name: /Volta/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("lotacao-volta")).toBeVisible();
  });

  test("Agenda: o seletor troca a viagem e a lotação", async ({ page }) => {
    await mockSupabase(page, { role: "admin" });
    await page.goto("/");
    const seletor = page.getByTestId("seletor-sentido");
    await seletor.getByRole("tab", { name: /Ida/ }).click();
    await expect(page.getByTestId("lotacao-ida")).toBeVisible();
    await expect(page.getByTestId("lotacao-volta")).toHaveCount(0);
    await seletor.getByRole("tab", { name: /Volta/ }).click();
    await expect(page.getByTestId("lotacao-volta")).toBeVisible();
    await expect(page.getByTestId("lotacao-ida")).toHaveCount(0);
  });

  for (const largura of [320, 360, 390, 430]) {
    test(`nada sai da tela em ${largura} px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await mockSupabase(page, { role: "admin" });
      await page.goto("/");
      const conferir = async (onde) => {
        await page.waitForTimeout(350);
        const largo = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(largo, `${onde} em ${largura}px`).toBeLessThanOrEqual(largura);
      };
      await conferir("Agenda");
      await abrirMenu(page, "Início");
      await conferir("Início");
      await abrirMenu(page, "Lista do Dia");
      await conferir("Lista");
      await abrirTela(page, "atendimento");
      await conferir("Atendimento");
      await abrirTela(page, "financeiro");
      await conferir("Gestão");
    });
  }
});

test.describe("reduzir movimento", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("a barra de baixo troca de forma sem animação", async ({ page }) => {
    await mockSupabase(page, { role: "admin" });
    await page.goto("/");
    const barra = page.getByTestId("barra-de-baixo");
    await expect(barra).toBeVisible();
    const duracao = await barra.evaluate((el) =>
      Math.max(
        ...getComputedStyle(el)
          .transitionDuration.split(",")
          .map((t) => Number.parseFloat(t)),
      ),
    );
    expect(duracao).toBeLessThan(0.01);
  });
});
