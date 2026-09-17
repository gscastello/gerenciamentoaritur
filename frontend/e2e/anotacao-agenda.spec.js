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
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();

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

test("Agenda: anotação sem telefone reconhecível mostra erro e não chama a RPC", async ({ page }) => {
  let chamouRpc = false;
  await mockSupabase(page, {
    role: "admin",
    occupancy: {},
    onCreate: () => {
      chamouRpc = true;
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Agenda$/ }).first().click();

  const campo = page.getByLabel("Anotar reserva — Buscar em Casa");
  await campo.fill("1P Cohatrac");
  await campo.press("Enter");

  await expect(page.getByText(/telefone/i)).toBeVisible();
  expect(chamouRpc).toBe(false);
});
