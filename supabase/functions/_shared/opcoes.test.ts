import { assertEquals } from "jsr:@std/assert";
import { formatarOpcoes, resolverOpcao } from "./opcoes.ts";

const OPCOES = [
  { id: "menu_ida", title: "Ida", description: "São Luís → Pirapemas" },
  { id: "menu_volta", title: "Volta" },
  { id: "menu_atendente", title: "Falar com atendente" },
];

Deno.test("formata opções numeradas com a instrução de resposta", () => {
  const texto = formatarOpcoes("Como posso ajudar?", OPCOES);
  assertEquals(
    texto,
    "Como posso ajudar?\n\n1 - Ida (São Luís → Pirapemas)\n2 - Volta\n3 - Falar com atendente\n\nResponda com o número da opção.",
  );
});

Deno.test("resolve o número digitado pro id da opção", () => {
  assertEquals(resolverOpcao("1", OPCOES), "menu_ida");
  assertEquals(resolverOpcao(" 3 ", OPCOES), "menu_atendente");
});

Deno.test("número fora da lista não é uma escolha", () => {
  assertEquals(resolverOpcao("0", OPCOES), null);
  assertEquals(resolverOpcao("4", OPCOES), null);
});

Deno.test("resolve pelo nome da opção, ignorando caixa e acento", () => {
  assertEquals(resolverOpcao("volta", OPCOES), "menu_volta");
  assertEquals(resolverOpcao("FALAR COM ATENDENTE", OPCOES), "menu_atendente");
});

Deno.test("texto livre ou sem opções ativas não é uma escolha", () => {
  assertEquals(resolverOpcao("queria ir amanhã", OPCOES), null);
  assertEquals(resolverOpcao("1", null), null);
  assertEquals(resolverOpcao("1", []), null);
  assertEquals(resolverOpcao("", OPCOES), null);
});
