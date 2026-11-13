import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Vencimentos (issues #366 e #369): estimativa do DAS pela receita lançada e o
// calendário de contas e documentos, com quitar e cadastrar.

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" });
const dia = (offset) => fmt.format(new Date(Date.now() + offset * 86400000));

function mesAnterior(n) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 10)).toISOString().slice(0, 10);
}

async function simular(page, { vencimentos }) {
  const chamadas = { criados: [], quitados: [] };
  let linhas = vencimentos.map((v) => ({ ...v }));
  await page.route("**/rest/v1/vencimentos*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      chamadas.criados.push(body);
      const row = { id: `v-novo-${chamadas.criados.length}`, quitado_em: null, ...body };
      linhas = [...linhas, row];
      return route.fulfill({ json: row });
    }
    return route.fulfill({ json: linhas });
  });
  await page.route("**/rest/v1/rpc/rpc_quitar_vencimento", async (route) => {
    const { p_id } = route.request().postDataJSON();
    chamadas.quitados.push(p_id);
    linhas = linhas.map((v) => (v.id === p_id ? { ...v, quitado_em: dia(0) } : v));
    return route.fulfill({ json: { success: true, proximo: null } });
  });
  // 12 meses de R$ 25 mil + o mês de apuração com R$ 30 mil → RBT12 300 mil → 8,08% (Anexo III)
  const receitas = Array.from({ length: 13 }, (_, i) => ({
    type: "receita",
    entry_date: mesAnterior(13 - i),
    amount: i === 12 ? 30000 : 25000,
  }));
  await page.route("**/rest/v1/financial_entries*", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "GET" && url.includes("type=eq.receita")) {
      return route.fulfill({ json: receitas });
    }
    return route.fallback();
  });
  return chamadas;
}

test("Vencimentos: DAS estimado, vencido em destaque, quitar e cadastrar", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  const chamadas = await simular(page, {
    vencimentos: [
      {
        id: "das",
        titulo: "DAS — Simples Nacional",
        categoria: "imposto",
        vence_em: `${dia(0).slice(0, 7)}-20`,
        valor: null,
        recorrencia: "mensal",
        avisar_dias: 5,
        quitado_em: null,
        vehicle_id: null,
      },
      {
        id: "ipva",
        titulo: "IPVA do ônibus",
        categoria: "veiculo",
        vence_em: dia(-3),
        valor: 1250,
        recorrencia: "anual",
        avisar_dias: 30,
        quitado_em: null,
        vehicle_id: null,
      },
      {
        id: "seguro",
        titulo: "Seguro da van",
        categoria: "seguro",
        vence_em: dia(90),
        valor: null,
        recorrencia: "anual",
        avisar_dias: 30,
        quitado_em: null,
        vehicle_id: null,
      },
    ],
  });
  await page.goto("/");
  await abrirTela(page, "vencimentos");

  // apuração = mês anterior ao do DAS em aberto; 30 mil × 8,08% = R$ 2.424,00
  await expect(page.getByTestId("valor-do-das")).toHaveText(/2\.424,00/);
  await expect(page.getByText("8,08%")).toBeVisible();

  const lista = page.getByTestId("lista-de-vencimentos");
  const nomes = await lista.locator(".text-sm.font-medium").allInnerTexts();
  expect(nomes[0]).toBe("IPVA do ônibus"); // o vencido vem primeiro
  await expect(lista.getByText("Venceu há 3 dias")).toBeVisible();

  await page.getByRole("button", { name: "Quitar IPVA do ônibus" }).click();
  await expect.poll(() => chamadas.quitados).toEqual(["ipva"]);

  await page.getByRole("button", { name: "Novo" }).click();
  const novo = page.getByTestId("novo-vencimento");
  await novo.getByLabel("O que vence").fill("Licenciamento da van");
  await novo.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Informe a data de vencimento.")).toBeVisible();
  await novo.getByLabel("Vence em").fill(dia(40));
  await novo.getByLabel("Valor (R$, opcional)").fill("180,50");
  await novo.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => chamadas.criados.length).toBe(1);
  expect(chamadas.criados[0]).toMatchObject({
    titulo: "Licenciamento da van",
    categoria: "veiculo",
    vence_em: dia(40),
    valor: 180.5,
    recorrencia: "anual",
    avisar_dias: 30,
  });
  await expect(lista.getByText("Licenciamento da van")).toBeVisible();
});
