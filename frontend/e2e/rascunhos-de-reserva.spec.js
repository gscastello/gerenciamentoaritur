import { expect, test } from "@playwright/test";
import { abrirTela } from "./support/navegar.js";
import { mockSupabase } from "./support/supabaseMock.js";

// Reservas preparadas pela IA (issue #254): o bot lê a conversa e, quando o
// cliente já mandou data e endereço, deixa o rascunho na aba Atendimento. A
// equipe lança com um toque (o formulário calcula preço e vaga como sempre).

const alvo = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

const RASCUNHOS = [
  {
    id: "d1",
    conversation_id: "c1",
    chatwoot_conversation_id: 55,
    customer_id: null,
    phone: "98988887777",
    customer_name: "Joana Pereira",
    type: "passagem",
    trip_date: alvo,
    direction: "ida",
    route_point_code: "busca",
    pickup_neighborhood: "Cohama",
    pickup_detail: "Rua 7, casa 12",
    dropoff_location: "Pirapemas centro",
    dropoff_area: null,
    quantity: 2,
    client_excerpt: "quero 2 passagens, moro no Cohama rua 7",
    notes: null,
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2",
    conversation_id: "c2",
    chatwoot_conversation_id: 56,
    customer_id: null,
    phone: "98977776666",
    customer_name: null,
    type: "encomenda",
    trip_date: alvo,
    direction: "ida",
    route_point_code: null,
    pickup_neighborhood: null,
    pickup_detail: "Rua Grande 10",
    dropoff_location: null,
    dropoff_area: null,
    quantity: 1,
    client_excerpt: "tenho uma caixa pra mandar",
    notes: null,
    updated_at: new Date().toISOString(),
  },
];

async function abrirAtendimento(page) {
  await page.goto("/");
  // reservas preparadas ficam na aba "Para lançar" do Atendimento (issue #360)
  await abrirTela(page, "para_lancar");
  await expect(page.getByText("Reservas prontas para lançar")).toBeVisible();
}

test("Atendimento: lança a reserva preparada pela IA com o formulário já preenchido", async ({
  page,
}) => {
  const criadas = [];
  await mockSupabase(page, {
    role: "admin",
    rascunhos: RASCUNHOS,
    onCreate: (route) => criadas.push(route.request().postDataJSON()),
  });
  await abrirAtendimento(page);

  const cartao = page.getByTestId("rascunho-reserva").first();
  await expect(cartao).toContainText("Buscar em Casa · Cohama, Rua 7, casa 12");
  await expect(cartao).toContainText("2 passagens");
  await expect(cartao).toContainText("Joana Pereira · 98988887777 · desce: Pirapemas centro");
  await expect(cartao).toContainText("quero 2 passagens, moro no Cohama rua 7");

  await cartao.getByRole("button", { name: /Lançar reserva de Joana Pereira/ }).click();
  await expect(page.getByTestId("aviso-costume")).toContainText("Preparada pela IA");
  await page.getByRole("button", { name: "Agendar", exact: true }).click();

  await expect.poll(() => criadas.length).toBe(1);
  expect(criadas[0]).toMatchObject({
    p_trip_date: alvo,
    p_direction: "ida",
    p_customer_name: "Joana Pereira",
    p_customer_phone: "98988887777",
    p_route_point_code: "busca",
    p_pickup_neighborhood: "Cohama",
    p_pickup_detail: "Rua 7, casa 12",
    p_dropoff_location: "Pirapemas centro",
    p_quantity: 2,
    p_unit_price: 80,
  });
});

test("Atendimento: encomenda preparada não tem Lançar nem valor; descartar some com transição", async ({
  page,
}) => {
  const descartes = [];
  await mockSupabase(page, { role: "atendente", rascunhos: RASCUNHOS });
  page.on("request", (r) => {
    if (r.url().includes("/rpc/rpc_descartar_rascunho_de_reserva"))
      descartes.push(r.postDataJSON());
  });
  await abrirAtendimento(page);

  const encomenda = page.getByTestId("rascunho-reserva").filter({ hasText: "Encomenda" });
  await expect(encomenda).toContainText("Rua Grande 10");
  await expect(encomenda.getByRole("button", { name: /Lançar/ })).toHaveCount(0);
  await expect(encomenda.getByRole("button", { name: "Copiar anotação" })).toBeVisible();
  await expect(encomenda).not.toContainText("R$");

  await page.getByRole("button", { name: /Descartar reserva preparada de 98977776666/ }).click();
  await expect.poll(() => descartes[0]?.p_draft_id).toBe("d2");
  await expect(page.getByTestId("rascunho-reserva")).toHaveCount(1);
});

test("Atendimento: sem reservas preparadas mostra o aviso", async ({ page }) => {
  await mockSupabase(page, { role: "admin" });
  await abrirAtendimento(page);
  await expect(page.getByText(/Nenhuma reserva preparada agora/)).toBeVisible();
});
