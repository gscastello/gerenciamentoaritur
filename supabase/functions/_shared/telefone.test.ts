import { assertEquals } from "jsr:@std/assert";
import { normalizarTelefone, variantesTelefone } from "./telefone.ts";

Deno.test("E.164 do Chatwoot vira o formato guardado em customers.phone", () => {
  assertEquals(normalizarTelefone("+5598981012388"), "98981012388");
  assertEquals(normalizarTelefone("5598981012388"), "98981012388");
});

Deno.test("número já normalizado não muda", () => {
  assertEquals(normalizarTelefone("98981012388"), "98981012388");
  assertEquals(normalizarTelefone("9870118165"), "9870118165");
});

Deno.test("DDD 55 de verdade não é confundido com o código do país", () => {
  assertEquals(normalizarTelefone("(55) 98765-4321"), "55987654321");
});

Deno.test("pontuação e marcas invisíveis do WhatsApp são removidas", () => {
  assertEquals(normalizarTelefone("+55 (98) 98101-2388‎"), "98981012388");
});

Deno.test("vazio e nulo viram string vazia", () => {
  assertEquals(normalizarTelefone(null), "");
  assertEquals(normalizarTelefone(undefined), "");
});

Deno.test("variantes: celular de 10 dígitos ganha a forma com o nono dígito", () => {
  assertEquals(variantesTelefone("559881012388").sort(), ["9881012388", "98981012388"]);
  assertEquals(variantesTelefone("9870118165").sort(), ["9870118165", "98970118165"]);
});

Deno.test("variantes: celular de 11 dígitos ganha a forma sem o nono dígito", () => {
  assertEquals(variantesTelefone("5598981012388").sort(), ["9881012388", "98981012388"]);
});

Deno.test("variantes: fixo não tem variante", () => {
  assertEquals(variantesTelefone("9832211234"), ["9832211234"]);
});
