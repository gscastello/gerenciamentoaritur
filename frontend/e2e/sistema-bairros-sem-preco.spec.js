import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #330: bairro cadastrado sem preço (o dono preenche depois) aparece no topo da
// lista de Sistema → Bairros com o campo vazio — nunca como R$ 0.

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /^Início$/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Preços por bairro (Buscar em Casa)")).toBeVisible();
}

test("Sistema > Bairros: bairro sem preço fica vazio no topo e o preço digitado é salvo", async ({
  page,
}) => {
  const salvos = [];
  await mockSupabase(page, { role: "admin" });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_upsert_neighborhood_price")) salvos.push(r.postDataJSON?.());
  });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText(/1 bairro\(s\) sem preço/)).toBeVisible();
  const campo = page.getByLabel("preço de Planalto Pingão");
  await campo.scrollIntoViewIfNeeded();
  await expect(campo).toHaveValue("");
  await expect(page.getByLabel("preço de Cohama")).toHaveValue("80");

  await campo.fill("85");
  await campo.blur();
  await expect
    .poll(() => salvos.find((s) => s?.p_neighborhood === "Planalto Pingão")?.p_price)
    .toBe(85);
});
