import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Agendar encomendas na Agenda e na Lista do Dia (database/42): uma
// encomenda pendente (vinda do bot, sem viagem ainda) ganha uma viagem/
// ponto reais e aparece nas duas telas, sem nunca ocupar vaga. Depois de
// agendada, a encomenda é exibida como uma passagem normal (issue #220): dentro
// da viagem, no ponto de embarque, com a mesma linha (caixa, WhatsApp, Editar).

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

function encomendaPendente(overrides = {}) {
  return {
    id: "res-enc-pend-1",
    data: null,
    direcao: null,
    pontoId: null,
    desembarque: null,
    nome: "Maria Receptora",
    telefone: "98988887777",
    quantidade: 1,
    valorTotal: null,
    status: "pendente",
    tipo: "encomenda",
    extra: { encItem: "Documentos", encEmbarque: "Rodoviária", encDesembarque: "Pirapemas centro" },
    criadoEm: new Date().toISOString(),
    ...overrides,
  };
}

test("Agenda: agenda uma encomenda pendente numa viagem/ponto real", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    reservations: [encomendaPendente()],
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();

  const linhaPendente = page.getByText(/Encomenda: Documentos/).locator("..");
  await expect(linhaPendente).toBeVisible();
  await linhaPendente.getByRole("button", { name: "Agendar" }).click();

  // modal pré-preenchido com o contato, onde buscar e a entrega
  await expect(
    page
      .getByRole("heading", { name: "Agendar encomenda" })
      .or(page.getByText("Agendar encomenda")),
  ).toBeVisible();
  await expect(page.getByLabel("Nome do contato (opcional)")).toHaveValue("Maria Receptora");
  await expect(page.getByLabel("Telefone do contato *")).toHaveValue("98988887777");
  await expect(page.getByLabel("Onde buscar (endereço) *")).toHaveValue("Rodoviária");
  await expect(page.getByLabel("Endereço de entrega (pode ser depois)")).toHaveValue(
    "Pirapemas centro",
  );

  await page.getByRole("button", { name: "Agendar", exact: true }).last().click();

  await expect(page.getByText(/Encomenda: Documentos/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova encomenda" })).toBeVisible();
  // agora aparece dentro da viagem, no ponto de embarque, como uma passagem
  await expect(page.getByText(/contato: Maria Receptora/)).toBeVisible();
  await expect(page.getByText(/Documentos · entrega: Pirapemas centro/)).toBeVisible();

  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_move).toMatchObject({ direction: "ida" });
  expect(chamadas[0].p_details.pickup_detail).toBe("Rodoviária");
  expect(chamadas[0].p_status).toBe("confirmada");
});

test("Agenda: cria uma encomenda nova do zero", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    createResult: {
      success: true,
      reservation_id: "e2e-enc-novo",
      status: "confirmada",
      message: "created",
    },
    onCreate: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Nova encomenda" }).click();
  await page.getByLabel("Onde buscar (endereço) *").fill("Rua 7, Centro");
  await page.getByLabel("Telefone do contato *").fill("98977776666");
  await page.getByLabel("Nome do contato (opcional)").fill("João Remetente");
  await page.getByLabel("Endereço de entrega (pode ser depois)").fill("Pirapemas centro");
  await page.getByLabel("Quem recebe (nome)").fill("Maria Destino");
  await page.getByRole("button", { name: "Criar" }).click();

  await expect.poll(() => chamadas.length).toBe(1);
  expect(chamadas[0].p_type).toBe("encomenda");
  expect(chamadas[0].p_customer_name).toBe("João Remetente");
  expect(chamadas[0].p_pickup_detail).toBe("Rua 7, Centro");
  expect(chamadas[0].p_dropoff_location).toBe("Pirapemas centro");
  expect(chamadas[0].p_extra_data.encDestinatarioNome).toBe("Maria Destino");
  expect(chamadas[0].p_unit_price).toBe(0);
});

test("Lista do Dia: mostra a encomenda agendada e marca como entregue", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    reservations: [
      encomendaPendente({
        id: "res-enc-agendada-1",
        data: hoje,
        direcao: "ida",
        pontoId: "rodoviaria",
        desembarque: "Pirapemas centro",
        status: "confirmada",
      }),
    ],
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Lista do Dia/ })
    .first()
    .click();

  // a encomenda entra na seção do ponto, com a linha do motorista, e não conta como passageiro
  await expect(page.getByText(/Documentos · entrega: Pirapemas centro/)).toBeVisible();
  await expect(page.getByText("ENC", { exact: true })).toBeVisible();
  await expect(page.getByText("1 encomenda", { exact: true })).toBeVisible();
  await expect(page.getByText("0 pax").first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar entrega" }).click();
  // espera a UI refletir a entrega antes de checar a chamada — o click só
  // dispara a RPC, não espera a resposta assíncrona.
  await expect(page.getByRole("button", { name: "Desmarcar entrega" })).toBeVisible();
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_status).toBe("embarcado");
});

// Dia que a Agenda abre por padrão (calendário de Fortaleza; depois das 14h, o seguinte).
function diaDaAgenda() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Fortaleza",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 12));
  if (Number(p.hour) >= 14) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function encomendaAgendada(overrides = {}) {
  return encomendaPendente({
    id: "res-enc-agendada-2",
    data: diaDaAgenda(),
    direcao: "ida",
    pontoId: "rodoviaria",
    desembarque: "Pirapemas centro",
    status: "confirmada",
    customer_id: "cli-enc-1",
    extra: {
      encItem: "Documentos",
      encRemetenteNome: "José Remetente",
      encRemetenteTelefone: "98911112222",
    },
    ...overrides,
  });
}

async function abrirAgendaComEncomenda(page, opts = {}) {
  await mockSupabase(page, { role: "admin", reservations: [encomendaAgendada()], ...opts });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();
}

test("Agenda: encomenda agendada aparece no ponto da viagem como uma passagem, sem ocupar vaga", async ({
  page,
}) => {
  await abrirAgendaComEncomenda(page);

  // mesma linha das passagens: etiqueta no lugar do "NP", contato, item e entrega
  await expect(page.getByText("ENC", { exact: true })).toBeVisible();
  await expect(page.getByText(/contato: Maria Receptora/)).toBeVisible();
  await expect(
    page.getByText(/Documentos · entrega: Pirapemas centro · de: José Remetente/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /WhatsApp/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Mais ações/ }).first()).toBeVisible();
  // cabeçalho do ponto conta a encomenda à parte; nenhuma passagem
  await expect(page.getByText("1 encomenda(s)", { exact: true })).toBeVisible();
  await expect(page.getByText(/passagem\(ns\)/)).toHaveCount(0);
});

test("Agenda: a caixa da linha marca a entrega da encomenda", async ({ page }) => {
  const chamadas = [];
  await abrirAgendaComEncomenda(page, {
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });

  await page.getByRole("button", { name: "Marcar entrega" }).click();
  await expect(page.getByRole("button", { name: "Desmarcar entrega" })).toBeVisible();
  await expect(page.getByText("✓ Entregue")).toBeVisible();
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].p_status).toBe("embarcado");

  await page.getByRole("button", { name: "Desmarcar entrega" }).click();
  await expect(page.getByRole("button", { name: "Marcar entrega" })).toBeVisible();
  await expect.poll(() => chamadas[1]?.p_status).toBe("confirmada");
});

test("Agenda: Editar abre o formulário da encomenda já preenchido e salva sem mudar o status", async ({
  page,
}) => {
  const chamadas = [];
  await abrirAgendaComEncomenda(page, {
    onEdit: (route) => chamadas.push(route.request().postDataJSON()),
  });

  await page
    .getByRole("button", { name: /^Mais ações/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Editar encomenda")).toBeVisible();
  await expect(page.getByLabel("Endereço de entrega (pode ser depois)")).toHaveValue(
    "Pirapemas centro",
  );
  await expect(page.getByLabel("O que é (opcional)")).toHaveValue("Documentos");
  await expect(page.getByLabel("Quem entrega (nome)")).toHaveValue("José Remetente");
  await expect(page.getByLabel("Nome do contato (opcional)")).toHaveValue("Maria Receptora");
  // encomenda de antes da regra, sem onde buscar: a edição não trava
  await expect(page.getByLabel("Onde buscar (endereço)")).toHaveValue("");

  await page.getByLabel("O que é (opcional)").fill("Caixa de sapato");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect.poll(() => chamadas.length).toBe(1);
  expect(chamadas[0].p_extra_data.encItem).toBe("Caixa de sapato");
  expect(chamadas[0].p_status ?? null).toBeNull();
  expect(chamadas[0].p_contact.customer_id).toBe("cli-enc-1");
  await expect(page.getByText(/Caixa de sapato · entrega: Pirapemas centro/)).toBeVisible();
});

test("Agenda: nova encomenda pela linha rápida (só onde buscar e telefone)", async ({ page }) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    createResult: {
      success: true,
      reservation_id: "e2e-enc-rapida",
      status: "confirmada",
      message: "created",
    },
    onCreate: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Nova encomenda" }).click();
  await page
    .getByLabel("Linha rápida: onde buscar, telefone e nome")
    .fill("Rua 7 Centro 98977776666");
  await expect(page.getByLabel("Onde buscar (endereço) *")).toHaveValue("Rua 7 Centro");
  await expect(page.getByLabel("Telefone do contato *")).toHaveValue("98977776666");
  await expect(page.getByLabel("Endereço de entrega (pode ser depois)")).toHaveValue("");
  await page.getByRole("button", { name: "Criar" }).click();

  await expect.poll(() => chamadas.length).toBe(1);
  expect(chamadas[0].p_type).toBe("encomenda");
  expect(chamadas[0].p_pickup_detail).toBe("Rua 7 Centro");
  expect(chamadas[0].p_dropoff_location).toBeNull();
  expect(chamadas[0].p_customer_phone).toBe("98977776666");
  expect(chamadas[0].p_customer_name).toBe("");
});

test("Agenda: encomenda sem onde buscar ou sem telefone não envia", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Nova encomenda" }).click();
  const criar = page.getByRole("button", { name: "Criar" });
  await page.getByLabel("Telefone do contato *").fill("98977776666");
  await expect(criar).toBeDisabled();
  await page.getByLabel("Onde buscar (endereço) *").fill("Rua 7, Centro");
  await expect(criar).toBeEnabled();
  await page.getByLabel("Telefone do contato *").fill("");
  await expect(criar).toBeDisabled();
});

test("Agenda: anotação rápida 'E endereço telefone' na caixinha do ponto cria a encomenda", async ({
  page,
}) => {
  const chamadas = [];
  await mockSupabase(page, {
    role: "admin",
    createResult: {
      success: true,
      reservation_id: "e2e-enc-caixinha",
      status: "confirmada",
      message: "created",
    },
    onCreate: (route) => chamadas.push(route.request().postDataJSON()),
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Agenda/ })
    .first()
    .click();

  // a caixinha do ponto abre ao tocar em "Anotar em …" (crítica de design, issue #393)
  await page
    .getByRole("button", { name: /^Anotar em / })
    .first()
    .click();
  const caixa = page.getByRole("textbox", { name: /Anotar reserva/ }).first();
  await caixa.fill("E 98977776666");
  await caixa.press("Enter");
  await expect(page.getByText(/onde vamos buscar/)).toBeVisible();
  expect(chamadas).toHaveLength(0);

  await caixa.fill("E Rua 7 Centro 98977776666 Zé");
  await caixa.press("Enter");
  await expect.poll(() => chamadas.length).toBe(1);
  expect(chamadas[0].p_type).toBe("encomenda");
  expect(chamadas[0].p_pickup_detail).toBe("Rua 7 Centro");
  expect(chamadas[0].p_customer_phone).toBe("98977776666");
  expect(chamadas[0].p_customer_name).toBe("Zé");
  expect(chamadas[0].p_dropoff_location).toBeNull();
  expect(chamadas[0].p_unit_price).toBe(0);
});
