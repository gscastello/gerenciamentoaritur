import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Central de notificações no app (issue #112): sino no cabeçalho, painel
// com lotação / cancelamento / mudança de endereço, marcar como lida.

const NOTIFS = [
  {
    id: "n1",
    kind: "lotacao",
    title: "Viagem lotada — ida 15/09",
    body: "A ida de 15/09 atingiu a capacidade (31 lugares).",
    reservation_id: null,
    trip_date: "2026-09-15",
    direction: "ida",
    meta: {},
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    lida: false,
  },
  {
    id: "n2",
    kind: "mudanca_desembarque",
    title: "Mudança de desembarque — Maria",
    body: "Viagem de 15/09 · novo desembarque: Cohab Anil",
    reservation_id: null,
    trip_date: "2026-09-15",
    direction: "volta",
    meta: {},
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
    lida: true,
  },
];

test("sino mostra as notificações e marca como lidas", async ({ page }) => {
  await mockSupabase(page, { role: "admin", notifications: NOTIFS });
  await page.goto("/");

  const sino = page.getByRole("button", { name: /^Notificações/ });
  await expect(sino).toBeVisible();
  // 1 não lida
  await expect(sino).toContainText("1");

  await sino.click();
  await expect(page.getByText("Viagem lotada — ida 15/09")).toBeVisible();
  await expect(page.getByText("Mudança de desembarque — Maria")).toBeVisible();

  await page.getByRole("button", { name: "Marcar todas como lidas" }).click();
  // some o contador do sino (aria-label volta a ser só "Notificações")
  await expect(sino).toHaveAttribute("aria-label", "Notificações");
});
