import { test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

const OUT = "C:/Users/WYLL INFORMATICA/AppData/Local/Temp/claude/7ed2cd52c7bcbb29/2157ca3c-c4b7-4c9d-b0f9-2bb376dc5caf/scratchpad/app";
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const base = { data: hoje, quantidade: 1, valorUnit: 70, valorTotal: 70, pagamento: "dinheiro", status: "confirmada", tipo: "passagem", pago: false, temEmbarcado: false, criadoEm: new Date().toISOString() };
const reservations = [
  { ...base, id: "b1", direcao: "ida", pontoId: "busca", bairro: "Cohatrac", rua: "Rua 12, casa 30", nome: "Carla Exemplo", telefone: "98911110005", valorTotal: 80 },
  { ...base, id: "b2", direcao: "ida", pontoId: "busca", bairro: "Turu", nome: "Davi Exemplo", telefone: "98911110006", pago: true, status: "embarcado" },
  { ...base, id: "a1", direcao: "ida", pontoId: "rodoviaria", nome: "Ana Exemplo", telefone: "98911110001", quantidade: 3, valorTotal: 210 },
  { ...base, id: "a2", direcao: "ida", pontoId: "rodoviaria", nome: "Bruno Exemplo", telefone: "98911110002", quantidade: 2, desembarque: "Matões", valorTotal: 140 },
  { ...base, id: "v1", direcao: "volta", pontoId: "pirapemas", nome: "Gabi Exemplo", telefone: "98911110004", quantidade: 2 },
];
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: "block" });

test("prints", async ({ page }) => {
  test.setTimeout(120_000);
  const barra = () => page.getByTestId("barra-de-baixo");
  const ir = (nome) => barra().getByRole("button", { name: new RegExp(nome) }).click();
  await page.goto("/");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/c-login.png` });
  await mockSupabase(page, { role: "admin", occupancy: {}, reservations });
  await page.goto("/");
  await page.waitForTimeout(1000);
  await page.locator('input[type="date"]').first().fill(hoje);
  await page.getByTestId("seletor-sentido").getByRole("tab", { name: /^Ida/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/c-agenda.png` });
  await page.screenshot({ path: `${OUT}/c-agenda-longa.png`, fullPage: true });
  await page.getByRole("button", { name: /Mais ações de Carla/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/c-menu.png` });
  await page.keyboard.press("Escape");
  await page.mouse.click(200, 100);
  await ir("Início");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/c-inicio.png` });
  await ir("Atendimento");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/c-atendimento.png` });
  await ir("Gestão");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/c-gestao.png` });
  await page.screenshot({ path: `${OUT}/c-gestao-longa.png`, fullPage: true });
  await ir("Lista do Dia");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/c-lista.png` });
});
