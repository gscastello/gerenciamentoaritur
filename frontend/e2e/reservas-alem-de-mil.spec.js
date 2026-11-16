import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #442 (crítico): o Supabase devolve no máximo 1.000 linhas por pedido e corta o resto sem
// erro. Com mais de 1.000 reservas na janela, as mais novas sumiam da Agenda e da Rota — um
// passageiro deixou de ser embarcado. O app tem de buscar em páginas e mostrar todas.

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const reserva = (i, campos = {}) => ({
  id: `r-${String(i).padStart(4, "0")}`,
  data: "2026-01-10",
  direcao: "ida",
  pontoId: "rodoviaria",
  nome: `Antigo ${i}`,
  telefone: `9899${String(i).padStart(7, "0")}`,
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "embarcado",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
  ...campos,
});

test("Agenda: a reserva de número 1.005 da janela aparece (busca em páginas)", async ({ page }) => {
  const reservas = Array.from({ length: 1004 }, (_, i) => reserva(i));
  reservas.push(
    reserva(1004, {
      data: hoje(),
      direcao: "volta",
      pontoId: "pirapemas",
      nome: "Passageira Lançada Por Último",
      status: "confirmada",
      embarque: "Avenida Teste, perto do hospital",
      criadoEm: new Date().toISOString(),
    }),
  );
  await mockSupabase(page, { role: "admin", reservations: reservas });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.locator('input[type="date"]').first().fill(hoje());
  await page.getByRole("tab", { name: /^Volta/ }).click();
  await expect(page.getByText("Passageira Lançada Por Último")).toBeVisible();

  // e na Rota (embarque da Volta), que é o que o motorista usa
  await page
    .getByRole("button", { name: /^Rota$/ })
    .first()
    .click();
  await expect(page.getByText("Passageira Lançada Por Último")).toBeVisible();
});
