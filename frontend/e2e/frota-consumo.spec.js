import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Consumo fora do normal (issue #369): a lista de abastecimentos marca o que ficou
// abaixo de 85% do km/l normal do veículo (mesma regra do aviso no sino).
const ab = (id, data, km, liters, cost) => ({
  id,
  vehicle_id: "veh-1",
  record_date: data,
  direction: "ida",
  km,
  liters,
  cost,
  deleted_at: null,
});

test("Operação: abastecimento com km/l fora do normal aparece marcado", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const linhas = [
    ab("f5", "2026-11-09", 300, 50, 300), // 6 km/l — fora
    ab("f4", "2026-11-07", 410, 50, 305),
    ab("f3", "2026-11-05", 380, 50, 290),
    ab("f2", "2026-11-03", 420, 50, 310),
    ab("f1", "2026-11-01", 400, 50, 300),
  ];
  await page.route("**/rest/v1/fuel_records*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: linhas });
    return route.fallback();
  });
  await page.goto("/");
  await abrirTela(page, "operacao");

  const alerta = page.getByText("⚠ consumo fora do normal: 6,0 km/l (normal 8,1)");
  await expect(alerta).toBeVisible();
  await expect(page.getByText(/⚠ consumo fora do normal/)).toHaveCount(1); // os normais não
});
