import { expect, test } from "@playwright/test";
import { campoAnotar } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #258: microfone na anotação rápida (reconhecimento de voz do navegador)
// (os atalhos dos pontos no topo da Agenda saíram na issue #399).

// Reconhecimento de voz falso: ao começar, "ouve" a frase de window.__FALA__.
const VOZ_FALSA = () => {
  class ReconhecimentoFalso {
    start() {
      window.__OUVINDO__ = true;
      setTimeout(() => {
        const fala = window.__FALA__ ?? "";
        this.onresult?.({ results: [[{ transcript: fala }]] });
        window.__OUVINDO__ = false;
        this.onend?.();
      }, 50);
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  window.SpeechRecognition = ReconhecimentoFalso;
  window.webkitSpeechRecognition = ReconhecimentoFalso;
};

async function abrirAgenda(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
}

test("Agenda: ditar a reserva preenche a anotação no formato rápido e cria ao confirmar", async ({
  page,
}) => {
  let corpo = null;
  await page.addInitScript(VOZ_FALSA);
  await page.addInitScript(() => {
    window.__FALA__ = "duas passagens Cohatrac telefone 98 99999 8888 nome Maria";
  });
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await abrirAgenda(page);

  const campo = await campoAnotar(page, "Buscar em Casa");
  await page.getByRole("button", { name: "Ditar reserva — Buscar em Casa" }).click();
  await expect(campo).toHaveValue("2P Cohatrac 98 99999 8888 Maria");
  // nada é salvo sozinho: a pessoa confere e confirma
  expect(corpo).toBeNull();

  await campo.press("Enter");
  await expect.poll(() => corpo?.p_customer_phone).toBe("98999998888");
  expect(corpo.p_quantity).toBe(2);
  expect(corpo.p_customer_name).toBe("Maria");
  expect(corpo.p_route_point_code).toBe("busca");
});

test("Agenda: navegador sem reconhecimento de voz não mostra o microfone", async ({ page }) => {
  await page.addInitScript(() => {
    // biome-ignore lint/performance/noDelete: simula navegador sem a API
    delete window.webkitSpeechRecognition;
    // biome-ignore lint/performance/noDelete: simula navegador sem a API
    delete window.SpeechRecognition;
  });
  await mockSupabase(page, { role: "admin", occupancy: {} });
  await abrirAgenda(page);
  await expect(await campoAnotar(page, "Buscar em Casa")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ditar reserva/ })).toHaveCount(0);
});

test("Agenda: sem atalhos dos pontos nem Iniciar viagem no topo (issue #399)", async ({ page }) => {
  await mockSupabase(page, { role: "admin", occupancy: {} });
  await abrirAgenda(page);
  // a Agenda abre na Volta depois que a Ida do dia sai: qualquer ponto serve
  await expect(page.locator('[id^="ponto-ida-"], [id^="ponto-volta-"]').first()).toBeVisible();
  await expect(page.getByTestId("atalhos-pontos")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Iniciar viagem/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova encomenda" })).toHaveCount(0);
});
