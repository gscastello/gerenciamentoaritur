import { assertEquals } from "jsr:@std/assert";
import { extrairNumeros, numerosNaoFundamentados } from "./botGuard.ts";

const FATOS = [
  "Saída de São Luís às 6:00 da Rodoviária, plataforma 30. Buscar em casa a partir das 5:00.",
  "Rodoviária: R$ 60,00 por passagem. Pirapemas ao meio-dia (12:00), Cantanhede às 13:00.",
  "Cada passageiro pode levar 1 mala grande.",
];

Deno.test("números que estão nas fontes passam", () => {
  const resposta = "Saímos às 6h da Rodoviária (plataforma 30) e a passagem custa R$ 60.";
  assertEquals(numerosNaoFundamentados(resposta, FATOS), []);
});

Deno.test("formatos de hora diferentes valem como o mesmo horário", () => {
  assertEquals(numerosNaoFundamentados("Saímos às 06:00.", FATOS), []);
  assertEquals(numerosNaoFundamentados("Saímos às 6h00.", FATOS), []);
  assertEquals(numerosNaoFundamentados("Em Cantanhede saímos às 13h.", FATOS), []);
});

Deno.test("valor inventado é barrado", () => {
  assertEquals(numerosNaoFundamentados("A passagem custa R$ 70.", FATOS), ["70"]);
});

Deno.test("horário inventado é barrado", () => {
  assertEquals(numerosNaoFundamentados("Saímos às 7h30.", FATOS), ["7:30"]);
});

Deno.test("o que o cliente escreveu pode ser repetido pelo bot", () => {
  assertEquals(numerosNaoFundamentados("Anotei 3 passagens.", [...FATOS, "quero 3 passagens"]), []);
});

Deno.test("decimais e milhar equivalem", () => {
  assertEquals(extrairNumeros("R$ 80,00 e 80 e 80.00"), ["80", "80", "80"]);
  assertEquals(extrairNumeros("R$ 1.200"), ["1200"]);
});

Deno.test("resposta sem números sempre passa", () => {
  assertEquals(numerosNaoFundamentados("Posso ajudar com a sua reserva!", FATOS), []);
});
