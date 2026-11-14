import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Lista do Dia → Desembarque: anotar à mão durante a viagem (issue #383).
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
    .getByRole("button", { name: /Lista do Dia/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Desembarque (rota)" }).click();
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
