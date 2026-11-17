import { expect, test } from "@playwright/test";
import { irParaODia } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #444 (crítico), depois da #442: o app não pode mostrar dado incompleto ou velho calado.

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const reserva = (id, nome) => ({
  id,
  data: hoje(),
  direcao: "ida",
  pontoId: "rodoviaria",
  nome,
  telefone: "98999990000",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
});

async function abrirAgenda(page) {
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await irParaODia(page, hoje());
}

test("lista que veio cortada em 1.000 linhas avisa na tela, com o nome da lista", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  // uma leitura sem paginação que volta com 1.000 linhas: o servidor cortou
  await page.route("**/rest/v1/dropoff_areas*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "content-range": "0-999/*",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "Content-Range",
      },
      body: "[]",
    }),
  );
  await page.goto("/");
  const aviso = page.getByTestId("aviso-lista-cortada");
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("Lista incompleta");
  await expect(aviso).toContainText("dropoff_areas");
});

test("lista normal não mostra o aviso de lista incompleta", async ({ page }) => {
  await mockSupabase(page, { role: "admin", reservations: [reserva("r-1", "Passageiro Um")] });
  await page.goto("/");
  await abrirAgenda(page);
  await expect(page.getByText("Passageiro Um")).toBeVisible();
  await expect(page.getByTestId("aviso-lista-cortada")).toHaveCount(0);
});

test("Agenda relê quando a internet volta: reserva criada no intervalo aparece sem recarregar", async ({
  page,
}) => {
  const banco = await mockSupabase(page, {
    role: "admin",
    reservations: [reserva("r-1", "Passageiro Um")],
  });
  await page.goto("/");
  await abrirAgenda(page);
  await expect(page.getByText("Passageiro Um")).toBeVisible();

  // outra pessoa lançou enquanto este aparelho estava sem conexão: o evento do tempo real se perdeu
  banco.adicionarReserva(reserva("r-2", "Passageira Do Intervalo"));
  await expect(page.getByText("Passageira Do Intervalo")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Passageira Do Intervalo")).toBeVisible();
});
