import { expect, test } from "@playwright/test";
import { SNAPSHOT_BACKUP_DIA, mockSupabase } from "./support/supabaseMock.js";

// Issue #208: backup diário das reservas do dia (database/60) — lista,
// "fazer agora", ver o conteúdo e baixar CSV.

async function abrirSistema(page) {
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await page.getByRole("button", { name: /^Sistema$/ }).click();
  await expect(page.getByText("Backup diário das reservas")).toBeVisible();
}

const DIA = {
  id: "bk-0",
  backup_date: "2026-10-22",
  taken_at: "2026-10-23T02:55:00Z",
  origem: "automatico",
  reservas_total: 1,
  reservas_canceladas: 0,
  passagens: 2,
  size_bytes: 900,
  data: { ...SNAPSHOT_BACKUP_DIA, dia: "2026-10-22" },
};

test("lista os dias com backup, mostra o conteúdo e baixa o CSV", async ({ page }) => {
  await mockSupabase(page, { role: "admin", backupsDia: [DIA] });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("22/10/2026")).toBeVisible();
  await expect(page.getByText(/1 reservas · 2 passagens · automático/)).toBeVisible();

  await page.getByRole("button", { name: "Ver backup de 22/10/2026" }).click();
  await expect(page.getByText("Maria Backup")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar CSV de 22/10/2026" }).click();
  expect((await download).suggestedFilename()).toBe("reservas-2026-10-22.csv");
});

test("'Fazer backup de hoje agora' acrescenta o dia à lista", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await abrirSistema(page);

  await expect(page.getByText("Ainda não há backups diários.")).toBeVisible();
  await page.getByRole("button", { name: "Fazer backup de hoje agora" }).click();
  await expect(page.getByText("23/10/2026")).toBeVisible();
  await expect(page.getByText(/1 reservas · 2 passagens · manual/)).toBeVisible();
});
