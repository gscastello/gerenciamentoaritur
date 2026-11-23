import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// A letra vem do Google: se ele não responder, o app abre do mesmo jeito (issue #494).
test("o app abre mesmo com o servidor da letra sem responder", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  // nunca responde (o pedido fica pendurado)
  await page.route("**/fonts.googleapis.com/**", () => undefined);
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();
});
