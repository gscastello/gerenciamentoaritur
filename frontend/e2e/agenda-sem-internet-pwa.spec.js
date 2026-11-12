import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #355: o aparelho SEM REDE NENHUMA (navigator.onLine = false), com o app
// instalado servido pelo service worker. No 1º carregamento a página ainda não é
// controlada pelo service worker, então o mock responde e o app guarda a cópia;
// depois, offline, tudo vem do aparelho.

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" });
const reservations = [fmt.format(new Date()), fmt.format(new Date(Date.now() + 86400000))].map(
  (data, i) => ({
    id: `res-pwa-${i}`,
    data,
    direcao: "ida",
    pontoId: "rodoviaria",
    nome: "Passageira Sem Rede Teste",
    telefone: "98991234567",
    quantidade: 1,
    valorUnit: 60,
    valorTotal: 60,
    pagamento: "dinheiro",
    status: "confirmada",
    tipo: "passagem",
    pago: false,
    temEmbarcado: false,
    criadoEm: new Date().toISOString(),
  }),
);

test("aparelho sem rede: o app instalado abre a Agenda salva na hora", async ({
  page,
  context,
}) => {
  await mockSupabase(page, { role: "admin", reservations });
  await page.goto("/");
  await expect(page.getByText("Passageira Sem Rede Teste").first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Passageira Sem Rede Teste").first()).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByTestId("aviso-sem-internet")).toContainText("Agenda salva em");
  // o logo vem do aparelho (precache), não quebra
  const logoOk = await page
    .getByRole("img", { name: "AriTur" })
    .first()
    .evaluate((img) => img.complete && img.naturalWidth > 0);
  expect(logoOk).toBe(true);
});
