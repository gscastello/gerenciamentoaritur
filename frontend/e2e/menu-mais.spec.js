import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// O "⋯" do topo do celular (issue #446): uma folha que sobe de baixo, com quem está conectado,
// as telas que não cabem na barra e "Sair da conta" com confirmação.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Mais: folha de baixo com quem está conectado, as telas e o sair que confirma", async ({
  page,
}) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  const folha = page.getByTestId("folha-mais");
  await expect(folha.getByText("Atendente E2E")).toBeVisible();
  await expect(folha.getByText("Administrador")).toBeVisible();
  const telas = folha.getByRole("navigation", { name: "Mais telas" });
  await expect(telas.getByRole("button", { name: "Passageiros" })).toContainText(
    "Grupos, fichas e quem sumiu",
  );
  await expect(telas.getByRole("button", { name: "Sistema" })).toBeVisible();

  // sair pede confirmação; "Ficar" mantém conectado
  await folha.getByRole("button", { name: "Sair da conta" }).click();
  await expect(folha.getByText(/Sair da conta neste aparelho\?/)).toBeVisible();
  await folha.getByRole("button", { name: "Ficar" }).click();
  await expect(folha.getByRole("button", { name: "Sair da conta" })).toBeVisible();

  // Esc fecha a folha, com saída animada
  await page.keyboard.press("Escape");
  await expect(folha).toHaveCount(0);

  // abrir uma tela pela folha marca ela como aberta na próxima vez
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByTestId("folha-mais").getByRole("button", { name: "Passageiros" }).click();
  await expect(page.getByTestId("topo-tela").getByRole("heading", { level: 1 })).toHaveText(
    "Passageiros",
  );
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await expect(
    page.getByTestId("folha-mais").getByRole("button", { name: "Passageiros" }),
  ).toHaveAttribute("aria-current", "page");
});
