import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Fluxos autenticados do app (issue #4). Sem projeto Supabase de teste
// no CI — o helper mockSupabase injeta a sessão e intercepta PostgREST/RPC.

test("app passa da tela de login e mostra a navegação por papel", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");

  // atendente vê Atendimento; NÃO vê Sistema (TAB_ROLES em App.jsx)
  await expect(page.getByRole("button", { name: /Atendimento/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sistema$/ })).toHaveCount(0);
});

test("botão Sair desloga e volta pra tela de login", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Atendimento/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sair da conta" }).first().click();

  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

// Regressão: a aba Sistema (só admin) precisa abrir sem quebrar. O PR #83
// referenciou <SistemaCidades /> sem a definição do componente e nenhum
// teste abria a aba como admin — o app quebrava só em produção.
test("admin abre a aba Sistema e as telas de configuração renderizam", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");

  // espera o app sair do login e montar a navegação
  await expect(page.getByRole("button", { name: /Dashboard/ }).first()).toBeVisible();

  // no mobile a barra inferior só mostra 4 itens + "Mais"; no desktop a
  // sidebar mostra tudo
  const sistema = page.getByRole("button", { name: /^Sistema$/ });
  if ((await sistema.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await sistema.click();

  await expect(page.getByText("Equipe e logins")).toBeVisible();
  await expect(page.getByText("Motorista E2E")).toBeVisible();
  await expect(page.getByText("Cidades da rota")).toBeVisible();
  await expect(page.getByText("Cidades atendidas")).toBeVisible();
  await expect(page.getByText("Cidades intermediárias")).toBeVisible();
  await expect(page.getByText("Locais de desembarque")).toBeVisible();
});

// Bloco de notas (issue #90 → notas soltas): cria, edita, fixa e apaga.
test("Bloco de notas: cria, edita, fixa e apaga uma nota", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Agenda/ }).first()).toBeVisible();

  const bloco = page.getByRole("button", { name: /^Bloco de notas$/ });
  if ((await bloco.count()) === 0) {
    await page.getByRole("button", { name: "Mais" }).click();
  }
  await bloco.click();

  await expect(page.getByText("Nenhuma nota ainda.")).toBeVisible();
  await page.getByRole("button", { name: "Criar a primeira" }).click();

  const area = page.getByPlaceholder("Escreva aqui…");
  await expect(area).toBeVisible();
  await area.fill("SÃO LUÍS\n2p Miranda +55 98 8516-6052\n1p Cohama 98 7024-2260");
  await area.blur();
  await expect(page.getByText("Nenhuma nota ainda.")).toHaveCount(0);

  await page.getByRole("button", { name: "Fixar" }).click();
  await expect(page.getByRole("button", { name: "Desafixar" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apagar" }).click();
  await expect(page.getByText("Nenhuma nota ainda.")).toBeVisible();
});

// Quem busca em casa (issue #96): chip cicla Táxi → Nós → Motorista.
test("Lista do Dia: chip de quem busca o passageiro em casa cicla", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date(),
  );
  await mockSupabase(page, {
    role: "admin",
    reservations: [
      {
        id: "res-busca-1",
        data: hoje,
        direcao: "ida",
        pontoId: "busca",
        bairro: "Cohama",
        nome: "Cliente Busca E2E",
        telefone: "98999998888",
        quantidade: 1,
        valorUnit: 80,
        valorTotal: 80,
        pagamento: "dinheiro",
        status: "confirmada",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        buscaPor: "taxi",
        criadoEm: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Lista do Dia/ })
    .first()
    .click();

  const chip = page.getByRole("button", { name: "Mudar quem busca este passageiro" });
  await expect(chip).toHaveText(/Táxi/);
  await chip.click();
  await expect(chip).toHaveText(/Gustavo/);
  await chip.click();
  await expect(chip).toHaveText(/Maurício/);
});

test("Agenda: lista de espera aparece com todos os aguardando vaga", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date(),
  );
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-espera-1",
        data: hoje,
        direcao: "ida",
        pontoId: "rodoviaria",
        nome: "Cliente Espera E2E",
        telefone: "98991110000",
        quantidade: 2,
        valorUnit: 60,
        valorTotal: 120,
        pagamento: "dinheiro",
        status: "espera",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        criadoEm: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/");
  await page.getByRole?.("button");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await expect(page.getByText(/Lista de espera\s*\(1\)/)).toBeVisible();
  await expect(page.getByText("Cliente Espera E2E")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chamar (dar vaga)" })).toBeVisible();
});

test("Agenda: seletor de quem busca em casa aparece e troca", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date(),
  );
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    reservations: [
      {
        id: "res-busca-ag",
        data: hoje,
        direcao: "ida",
        pontoId: "busca",
        bairro: "Turu",
        nome: "Cliente Agenda E2E",
        telefone: "98999997777",
        quantidade: 1,
        valorUnit: 80,
        valorTotal: 80,
        pagamento: "dinheiro",
        status: "confirmada",
        tipo: "passagem",
        pago: false,
        temEmbarcado: false,
        buscaPor: "taxi",
        criadoEm: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  // depois das 14h em Fortaleza a Agenda abre no dia seguinte por padrão
  // (diaAgendaPadrao em tabShared.jsx) — navega explicitamente pro dia da
  // reserva em vez de depender do default.
  await page.locator('input[type="date"]').first().fill(hoje);

  // na Agenda o seletor mostra as 4 opções (táxi, Gustavo, Maurício, Ari)
  const grupo = page.getByRole("group", { name: "Quem busca este passageiro" });
  await expect(grupo.getByRole("button", { name: "Táxi" })).toHaveAttribute("aria-pressed", "true");
  await grupo.getByRole("button", { name: "Gustavo" }).click();
  await expect(grupo.getByRole("button", { name: "Gustavo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

// Regressão (issue #168): criar a PRIMEIRA reserva de uma janela vazia disparava
// um refetch (App.jsx) que reacendia o `loading` de página inteira e trocava a
// árvore da aba pela <TabSkeleton> — o React desmontava a aba e ela perdia o
// estado local. O caso original era o wizard de Reservar (aposentado); o
// mecanismo é de TODA aba, então o teste usa as caixas de anotação rápida da
// Agenda: o rascunho de um ponto tem que sobreviver à criação em outro.
test("Agenda: criar a primeira reserva de uma janela vazia não desmonta a aba", async ({
  page,
}) => {
  let criou = false;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: () => {
      criou = true;
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const rascunho = page.getByLabel("Anotar reserva — Rodoviária");
  await rascunho.fill("rascunho que não pode sumir");

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("1P Cohatrac 98999998888");
  await campo.press("Enter");

  await expect.poll(() => criou).toBe(true);
  await expect(campo).toHaveValue("");
  await expect(rascunho).toHaveValue("rascunho que não pode sumir");
});
