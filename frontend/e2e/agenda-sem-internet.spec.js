import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Issue #355 (dono, 12/11): abrir a Agenda mesmo sem internet. O app guarda a última
// leitura no aparelho e, sem rede, mostra essa cópia com o aviso "Sem internet".

// sem o service worker, as chamadas passam pelo mock (ver navegacao-inicio.spec.js)
test.use({ serviceWorkers: "block" });

const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" });
const hoje = fmt.format(new Date());
const amanha = fmt.format(new Date(Date.now() + 86400000));

// a Agenda abre em hoje ou amanhã (depois que a Ida sai): a mesma reserva nos dois dias
const reservations = [hoje, amanha].map((data, i) => ({
  id: `res-off-${i}`,
  data,
  direcao: "ida",
  pontoId: "rodoviaria",
  nome: "Passageira Sem Rede Teste",
  telefone: "98991234567",
  quantidade: 1,
  valorUnit: 60,
  valorTotal: 60,
  pagamento: "dinheiro",
  status: "confirmada",
  tipo: "passagem",
  pago: false,
  temEmbarcado: false,
  criadoEm: new Date().toISOString(),
}));

const nome = (page) => page.getByText("Passageira Sem Rede Teste").first();

async function cortarInternet(page) {
  // registrada depois do mock, vale por cima dele: nenhuma chamada ao Supabase passa
  await page.route(/supabase\.co/, (route) => route.abort("internetdisconnected"));
}

test("sem internet, a Agenda abre com a cópia salva e o aviso", async ({ page }) => {
  await mockSupabase(page, { role: "admin", reservations });
  await page.goto("/");
  await expect(nome(page)).toBeVisible();
  await expect(page.getByTestId("aviso-sem-internet")).toHaveCount(0);

  await cortarInternet(page);
  await page.reload();
  await expect(nome(page)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("aviso-sem-internet")).toContainText("Sem internet");
  await expect(page.getByTestId("aviso-sem-internet")).toContainText("Agenda salva em");
  await expect(page.getByText("Conta sem permissão")).toHaveCount(0);
});

test("sem internet e com o token vencido, não volta para o login", async ({ page }) => {
  await mockSupabase(page, { role: "admin", reservations });
  await page.goto("/");
  await expect(nome(page)).toBeVisible();

  // a sessão guardada venceu (mais de 1 h sem rede): o Supabase não consegue renovar
  await page.addInitScript(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.endsWith("-auth-token")) continue;
      const s = JSON.parse(localStorage.getItem(k));
      s.expires_at = Math.floor(Date.now() / 1000) - 600;
      localStorage.setItem(k, JSON.stringify(s));
    }
  });
  await cortarInternet(page);
  await page.reload();
  await expect(nome(page)).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("aviso-sem-internet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Entrar/ })).toHaveCount(0);
});

test("sair da conta apaga a cópia salva", async ({ page }) => {
  await mockSupabase(page, { role: "admin", reservations });
  await page.goto("/");
  await expect(nome(page)).toBeVisible();
  const antes = await page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith("aritur:offline:")).length,
  );
  expect(antes).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Sair da conta" }).first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((k) => k.startsWith("aritur:offline:")).length,
      ),
    )
    .toBe(0);
});
