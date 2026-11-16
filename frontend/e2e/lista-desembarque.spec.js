import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Rota → Desembarque (antiga Lista do Dia): anotar à mão durante a viagem (issue #383).
// Começa em branco, não muda a reserva e funciona sem internet.

// depois do reload o service worker passaria a atender as chamadas e o page.route não
// as veria (mesmo motivo de agenda-sem-internet.spec.js)
test.use({ serviceWorkers: "block" });

function simular(page) {
  const servidor = { linhas: [], salvamentos: 0, semRede: false };
  // mesma regra da RPC (database/106): por id, vale o `em` mais recente
  const juntar = (a, b) => {
    const m = new Map();
    for (const l of [...a, ...b]) if (!m.has(l.id) || l.em > m.get(l.id).em) m.set(l.id, l);
    return [...m.values()].sort((x, y) => x.criada.localeCompare(y.criada));
    // (a ordem da tela sai de `ordem` no app, que junta e ordena de novo — issue #440)
  };
  page.route("**/rest/v1/listas_desembarque*", (route) =>
    servidor.semRede
      ? route.abort("internetdisconnected")
      : route.fulfill({ json: servidor.linhas.length ? [{ linhas: servidor.linhas }] : [] }),
  );
  page.route("**/rest/v1/rpc/rpc_salvar_lista_desembarque", (route) => {
    if (servidor.semRede) return route.abort("internetdisconnected");
    servidor.salvamentos += 1;
    servidor.linhas = juntar(servidor.linhas, route.request().postDataJSON().p_linhas);
    return route.fulfill({ json: servidor.linhas });
  });
  return servidor;
}

async function abrirDesembarque(page) {
  await page
    .getByRole("button", { name: /^Rota$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Desembarque", exact: true }).click();
  await page.getByRole("button", { name: "Ida", exact: true }).click();
}

test("Desembarque: anota, marca, apaga e guarda no aparelho sem internet", async ({ page }) => {
  await mockSupabase(page, { role: "admin", hora: null }); // a lista junta pela hora de cada mudança: relógio de verdade
  const servidor = simular(page);
  await page.goto("/");
  await abrirDesembarque(page);

  await expect(page.getByText(/Nada anotado na Ida deste dia/)).toBeVisible();
  const campo = page.getByLabel("Onde o passageiro desce");
  await campo.fill("2P — Cohatrac, em frente à padaria");
  await campo.press("Enter");
  const lista = page.getByTestId("lista-desembarque-anotada");
  await expect(lista.getByText("2P — Cohatrac, em frente à padaria")).toBeVisible();
  await expect(campo).toHaveValue("");
  await expect.poll(() => servidor.linhas.length).toBe(1);
  await expect(page.getByTestId("estado-da-lista")).toHaveText(/Salvo/);

  await page.getByRole("button", { name: "Marcar 2P — Cohatrac, em frente à padaria" }).click();
  await expect.poll(() => servidor.linhas[0]?.feito).toBe(true);

  // sem internet: anota mesmo assim e avisa que está só no aparelho
  servidor.semRede = true;
  await campo.fill("1P Turu");
  await page.getByRole("button", { name: "Anotar" }).click();
  await expect(lista.getByText("1P Turu")).toBeVisible();
  await expect(page.getByTestId("estado-da-lista")).toHaveText(
    /No aparelho · envia quando a internet voltar/,
  );
  expect(servidor.linhas).toHaveLength(1);

  // recarregou sem internet: as duas linhas continuam (cópia do aparelho)
  await page.reload();
  await abrirDesembarque(page);
  await expect(lista.getByText("1P Turu")).toBeVisible();
  await expect(lista.getByTestId("linha-desembarque")).toHaveCount(2);

  // a internet voltou: envia o que estava no aparelho, sem perder o "feito"
  servidor.semRede = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => servidor.linhas.length, { timeout: 10000 }).toBe(2);
  expect(servidor.linhas[0].feito).toBe(true);
  await expect(page.getByTestId("estado-da-lista")).toHaveText(/Salvo/);

  // apagar some da lista (e fica marcada como apagada no banco)
  await page.getByRole("button", { name: "Apagar 1P Turu" }).click();
  await expect(lista.getByText("1P Turu")).toHaveCount(0);
  await expect.poll(() => servidor.linhas.find((l) => l.texto === "1P Turu")?.apagada).toBe(true);
});

test("Desembarque: organiza o que foi anotado e copia na ordem (issue #440)", async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiado = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t) => {
          window.__copiado = t;
        },
      },
    });
  });
  await mockSupabase(page, { role: "admin", hora: null });
  const servidor = simular(page);
  await page.goto("/");
  await abrirDesembarque(page);

  const campo = page.getByLabel("Onde o passageiro desce");
  for (const t of ["1P Cohatrac", "2P Turu", "1P Rodoviária"]) {
    await campo.fill(t);
    await campo.press("Enter");
  }
  const lista = page.getByTestId("lista-desembarque-anotada");
  await expect(lista.getByTestId("linha-desembarque")).toHaveCount(3);
  await expect.poll(() => servidor.linhas.length).toBe(3);

  // organizar: a Rodoviária para o topo
  await page.getByRole("button", { name: "Organizar" }).click();
  await page.getByRole("button", { name: "Mover 1P Rodoviária para o topo" }).click();
  await page.getByRole("button", { name: /Salvar ordem/ }).click();
  const linhas = lista.getByTestId("linha-desembarque");
  await expect(linhas.nth(0)).toContainText("1P Rodoviária");
  await expect(linhas.nth(1)).toContainText("1P Cohatrac");
  await expect(linhas.nth(2)).toContainText("2P Turu");
  // só a linha que mudou de lugar ganhou posição; o banco guardou
  await expect
    .poll(() => servidor.linhas.filter((l) => typeof l.ordem === "number").map((l) => l.texto))
    .toEqual(["1P Rodoviária"]);

  // copiar: na ordem da tela, com ✓ em quem desceu
  await page.getByRole("button", { name: "Marcar 1P Cohatrac" }).click();
  await page.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
  const copiado = await page.evaluate(() => window.__copiado);
  expect(copiado).toMatch(/^Desembarque · Ida · /);
  expect(copiado.split(/\n/).slice(1)).toEqual([
    "1. 1P Rodoviária",
    "2. 1P Cohatrac ✓",
    "3. 2P Turu",
  ]);

  // recarregou: a ordem continua (veio do banco)
  await page.reload();
  await abrirDesembarque(page);
  await expect(lista.getByTestId("linha-desembarque").nth(0)).toContainText("1P Rodoviária");
});
