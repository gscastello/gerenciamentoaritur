import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #258: microfone na anotação rápida (reconhecimento de voz do navegador)
// e atalhos dos pontos de embarque no topo da Agenda.

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

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
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
  await expect(page.getByLabel("Anotar reserva — Buscar em Casa")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ditar reserva/ })).toHaveCount(0);
});

test("Agenda: atalhos no topo levam a cada ponto da Ida e da Volta", async ({ page }) => {
  await mockSupabase(page, { role: "admin", occupancy: {} });
  await abrirAgenda(page);

  const atalhos = page.getByTestId("atalhos-pontos");
  await expect(atalhos).toBeVisible();
  await expect(
    atalhos.getByRole("button", { name: /Ir para Buscar em Casa \(Ida\)/ }),
  ).toBeVisible();
  await expect(atalhos.getByRole("button", { name: /\(Volta\)/ }).first()).toBeVisible();

  // o último ponto da Volta fica lá embaixo: o atalho rola até ele
  const ultimoVolta = atalhos.getByRole("button", { name: /\(Volta\)/ }).last();
  const nome = (await ultimoVolta.getAttribute("aria-label")).match(/Ir para (.+) \(Volta\)/)[1];
  const alvo = page.locator(`[id^="ponto-volta-"]`).filter({ hasText: nome.toUpperCase() });
  await expect(alvo).not.toBeInViewport();
  await ultimoVolta.click();
  await expect(alvo).toBeInViewport();
});
