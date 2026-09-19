import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Fluxos autenticados de Reserva (issue #4). Sem projeto Supabase de teste
// no CI — o helper mockSupabase injeta a sessão e intercepta PostgREST/RPC.

// Data usada nos fluxos que chegam a criar reserva de verdade: sempre a
// PRÓXIMA terça-feira a partir de hoje. Nunca fica no passado (o form de
// Reservar recusa data < hoje) e evita segunda (ajuste de horário
// especial) e o próprio dia (alguns fluxos tratam "hoje" como caso
// especial). Antes disto a data vinha fixa ("2026-09-15") e o teste que
// confere o status final da reserva parava de passar assim que o
// calendário virava a data — corrigido na auditoria de 2026-09-16.
function proximaTerca() {
  const d = new Date();
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== 2); // 0=domingo ... 2=terça
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(d);
}

test("app passa da tela de login e mostra a navegação por papel", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");

  // atendente vê Reservar; NÃO vê Sistema (TAB_ROLES em App.jsx)
  await expect(page.getByRole("button", { name: /Reservar/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sistema$/ })).toHaveCount(0);
});

test("botão Sair desloga e volta pra tela de login", async ({ page }) => {
  await mockSupabase(page, { role: "atendente" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Reservar/ }).first()).toBeVisible();

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
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
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
  await page.getByRole("button", { name: /Lista do Dia/ }).first().click();

  const chip = page.getByRole("button", { name: "Mudar quem busca este passageiro" });
  await expect(chip).toHaveText(/Táxi/);
  await chip.click();
  await expect(chip).toHaveText(/Gustavo/);
  await chip.click();
  await expect(chip).toHaveText(/Maurício/);
});

test("Agenda: lista de espera aparece com todos os aguardando vaga", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
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
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();
  await expect(page.getByText(/Lista de espera\s*\(1\)/)).toBeVisible();
  await expect(page.getByText("Cliente Espera E2E")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chamar (dar vaga)" })).toBeVisible();
});

test("Agenda: chip de quem busca em casa também aparece e cicla", async ({ page }) => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
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
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();

  const chip = page.getByRole("button", { name: "Mudar quem busca este passageiro" });
  await expect(chip).toHaveText(/Táxi/);
  await chip.click();
  await expect(chip).toHaveText(/Gustavo/);
});

test("Reservar: data → direção com vaga → escolha do ponto de embarque", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", occupancy: {} });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await expect(page.getByText("Para quando é a viagem?")).toBeVisible();
  await page.locator('input[type="date"]').fill(proximaTerca());
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("O que você precisa?")).toBeVisible();
  await page.getByRole("button", { name: /Ida ·/ }).click();

  await expect(page.getByText("Local de embarque")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rodoviária/ })).toBeVisible();
});

test("Reservar: roteiro do cliente até os dados da reserva", async ({ page }) => {
  await mockSupabase(page, { role: "atendente", occupancy: {} });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill(proximaTerca());
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Ida ·/ }).click();
  await page.getByRole("button", { name: /Rodoviária/ }).click();

  // step "Dados da reserva": quantidade default 1, desembarque + contato
  await expect(page.getByText("Dados da reserva")).toBeVisible();
  await page.getByLabel("Onde você vai ficar (desembarque)").selectOption("pirapemas");
  await page.getByLabel("Nome completo").fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");
  // com os campos obrigatórios preenchidos, o botão de avançar habilita
  await expect(page.getByRole("button", { name: "Continuar" })).toBeEnabled();
});

test("Reservar: desembarque em cidade intermediária → reserva pendente (issue #6)", async ({
  page,
}) => {
  let createBody = null;
  await mockSupabase(page, {
    role: "atendente",
    occupancy: {},
    createResult: { success: true, reservation_id: "e2e-pend-1", status: "pendente", message: "created" },
    onCreate: (route) => {
      createBody = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill(proximaTerca());
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Ida ·/ }).click();
  await page.getByRole("button", { name: /Rodoviária/ }).click();

  await expect(page.getByText("Dados da reserva")).toBeVisible();
  await page.getByLabel("Onde você vai ficar (desembarque)").selectOption("outro");
  await page.getByRole("textbox", { name: "Onde você vai ficar *" }).fill("perto do posto em Bacabeira");
  await page.getByLabel("Nome completo").fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");

  // a UI já avisa que vai ficar pendente
  await expect(page.getByText(/fora da nossa área padrão|ficará\s+pendente/i)).toBeVisible();

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Dinheiro" }).click();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect
    .poll(() => createBody?.p_status, { timeout: 10000 })
    .toBe("pendente");
});

test("Reservar: viagem lotada → lista de espera → confirmação (RPC com status espera)", async ({
  page,
}) => {
  let createBody = null;
  await mockSupabase(page, {
    role: "atendente",
    // ReservarTab calcula vagas a partir de v_reservations_flat + capacidade
    // do veículo padrão (31). Uma reserva confirmada de 40 lugares lota a Ida.
    reservations: [
      { id: "r-cheia", data: proximaTerca(), direcao: "ida", status: "confirmada", tipo: "passagem", quantidade: 40 },
    ],
    createResult: { success: true, reservation_id: "e2e-espera-1", status: "espera", message: "created" },
    onCreate: (route) => {
      createBody = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Reservar/ }).first().click();

  await page.locator('input[type="date"]').fill(proximaTerca());
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("button", { name: /Ida.*Lotado/s }).click();
  await expect(page.getByText("Lista de espera", { exact: true })).toBeVisible();

  await page.getByLabel("Nome", { exact: true }).fill("Cliente E2E");
  await page.getByLabel("WhatsApp", { exact: true }).fill("98999990000");
  await page.getByRole("button", { name: "Entrar na lista de espera" }).click();

  await expect(page.getByText("Você entrou na lista de espera!", { exact: true })).toBeVisible();
  expect(createBody?.p_status).toBe("espera");
});
