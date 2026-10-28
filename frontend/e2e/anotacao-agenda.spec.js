import { expect, test } from "@playwright/test";
import { mockSupabase } from "./support/supabaseMock.js";

// Anotação rápida direto na Agenda (pedido do usuário, 2026-09-17):
// escolhe a categoria de embarque abrindo a Agenda mesmo, escreve
// "1P Cohatrac 98999998888" na linha do ponto/horário e o sistema
// reconhece o formato e cria a reserva sozinho — sem abrir modal.

test("Agenda: anotação rápida no ponto cria a reserva sem abrir modal", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await expect(campo).toBeVisible();
  await campo.fill("1P Cohatrac 98999998888");
  await campo.press("Enter");

  await expect.poll(() => corpo?.p_customer_phone).toBe("98999998888");
  expect(corpo.p_direction).toBe("ida");
  expect(corpo.p_route_point_code).toBe("busca");
  expect(corpo.p_quantity).toBe(1);
  expect(corpo.p_pickup_neighborhood).toBe("Cohatrac");
  expect(corpo.p_pickup_detail).toBeNull();
  expect(corpo.p_customer_name).toContain("Cohatrac"); // cliente novo -> nome-placeholder com o bairro
  expect(corpo.p_unit_price).toBe(80); // bairro fora da tabela -> preço padrão

  // input limpa sozinho depois de criar com sucesso
  await expect(campo).toHaveValue("");
});

test("Agenda: anotação rápida com prefixo 'E' agenda uma encomenda no ponto, sem abrir modal", async ({
  page,
}) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await expect(campo).toBeVisible();
  await campo.fill("E Documentos 98988887777");
  await campo.press("Enter");

  await expect.poll(() => corpo?.p_customer_phone).toBe("98988887777");
  expect(corpo.p_type).toBe("encomenda");
  expect(corpo.p_direction).toBe("ida");
  expect(corpo.p_route_point_code).toBe("busca");
  expect(corpo.p_unit_price).toBe(0);
  expect(corpo.p_status).toBe("confirmada");
  expect(corpo.p_extra_data).toMatchObject({ encItem: "Documentos" });

  await expect(campo).toHaveValue("");
});

test("Agenda: anotação sem telefone reconhecível mostra erro e não chama a RPC", async ({
  page,
}) => {
  let chamouRpc = false;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: () => {
      chamouRpc = true;
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("1P Cohatrac");
  await campo.press("Enter");

  await expect(page.getByText(/telefone/i)).toBeVisible();
  expect(chamouRpc).toBe(false);
});

// Issue #202: ordem NP - Endereço - telefone - nome na própria linha.
test("Agenda: anotação rápida com nome — NP, endereço, telefone e nome numa linha só", async ({
  page,
}) => {
  let corpo = null;
  let consultasDeCliente = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/customers") && r.method() === "GET") consultasDeCliente += 1;
  });
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("2P Anjo da Guarda Rua 3 98988887777 Maria Silva");
  await campo.press("Enter");

  await expect.poll(() => corpo?.p_customer_phone).toBe("98988887777");
  expect(corpo.p_quantity).toBe(2);
  expect(corpo.p_customer_name).toBe("Maria Silva");
  // o bairro conhecido cobra o preço dele; o resto do endereço vira detalhe
  expect(corpo.p_pickup_neighborhood).toBe("Anjo da Guarda");
  expect(corpo.p_pickup_detail).toBe("Rua 3");
  expect(corpo.p_unit_price).toBe(90);
  // com o nome digitado, não precisa consultar o cliente pelo telefone
  expect(consultasDeCliente).toBe(0);

  // pronto para a próxima anotação, sem precisar clicar de novo no campo
  await expect(campo).toHaveValue("");
  await expect(campo).toBeFocused();
});

test("Agenda: anotação rápida aceita ' - ' entre as partes", async ({ page }) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("1P - Cohama - 98 7024-2260 - João");
  await campo.press("Enter");

  await expect.poll(() => corpo?.p_customer_phone).toBe("9870242260");
  expect(corpo.p_customer_name).toBe("João");
  expect(corpo.p_pickup_neighborhood).toBe("Cohama");
  expect(corpo.p_unit_price).toBe(80);
});

test("Agendar passagem: a linha rápida preenche quantidade, endereço, telefone e nome", async ({
  page,
}) => {
  let corpo = null;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: (route) => {
      corpo = JSON.parse(route.request().postData() || "{}");
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /^Agenda$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Ações rápidas" }).click();
  await page.getByRole("button", { name: "Agendar passagem" }).click();

  await page.getByLabel(/Linha rápida/).fill("2P Cohama Rua 7 98999998888 Maria Silva");
  await expect(page.getByLabel("Nome (ou telefone)")).toHaveValue("Maria Silva");
  await expect(page.getByLabel("Telefone (ou nome)")).toHaveValue("98999998888");
  await expect(page.getByLabel("Quantidade")).toHaveValue("2");
  await expect(page.getByLabel(/Bairro/)).toHaveValue("Cohama");

  await page
    .getByRole("button", { name: /^Agendar$/ })
    .first()
    .click();
  await expect.poll(() => corpo?.p_customer_phone).toBe("98999998888");
  expect(corpo.p_customer_name).toBe("Maria Silva");
  expect(corpo.p_quantity).toBe(2);
  expect(corpo.p_pickup_neighborhood).toBe("Cohama");
  expect(corpo.p_pickup_detail).toBe("Rua 7");
});
