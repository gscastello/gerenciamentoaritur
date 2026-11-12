import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { mensagemDeConfirmacao, primeiroNome, type ReservaParaConfirmar, rotuloDoDia } from "./confirmacaoAoCliente.ts";

const HOJE = "2026-11-11"; // quarta

const volta: ReservaParaConfirmar = {
  tipo: "passagem",
  direcao: "volta",
  data: HOJE,
  pontoCodigo: "pirapemas",
  pontoNome: "Pirapemas",
  bairro: null,
  detalhe: "Eurico Ribeiro, casa amarela",
  desembarque: "Miranda do Norte",
  quantidade: 1,
  aConfirmar: [],
};

Deno.test("rótulo do dia: hoje, amanhã e dia da semana", () => {
  assertEquals(rotuloDoDia("2026-11-11", HOJE), "de hoje, quarta (11/11)");
  assertEquals(rotuloDoDia("2026-11-12", HOJE), "de amanhã, quinta (12/11)");
  assertEquals(rotuloDoDia("2026-11-14", HOJE), "de sábado (14/11)");
});

Deno.test("primeiro nome do cadastro", () => {
  assertEquals(primeiroNome("Auristelia Coutinho"), "Auristelia");
  assertEquals(primeiroNome(""), null);
  assertEquals(primeiroNome(null), null);
});

Deno.test("Volta de hoje: resumo com dia, embarque, desembarque e quantidade, sem valor", () => {
  const m = mensagemDeConfirmacao([volta], { hoje: HOJE, nome: "Auristelia Coutinho" });
  assert(m);
  assertStringIncludes(m, "Prontinho, Auristelia! ✅ Sua vaga está reservada:");
  assertStringIncludes(m, "🚐 Volta de hoje, quarta (11/11): sai de Pirapemas (Eurico Ribeiro, casa amarela) e desce em Miranda do Norte · 1 passagem");
  assertStringIncludes(m, "Se algo estiver diferente, é só me responder aqui.");
  assert(!/R\$|reais|valor/i.test(m), m);
  // não pode ser lida como um novo "Agendado ☑️"
  assert(!/agendad/i.test(m));
});

Deno.test("Ida sem endereço: pede o endereço; marcas internas não aparecem", () => {
  const m = mensagemDeConfirmacao(
    [{ ...volta, direcao: "ida", data: "2026-11-12", pontoCodigo: "busca", pontoNome: "Buscar em Casa", detalhe: "Endereço a confirmar", desembarque: "Pirapemas", quantidade: 2, aConfirmar: ["endereco"] }],
    { hoje: HOJE, nome: null },
  );
  assert(m);
  assertStringIncludes(m, "Prontinho! ✅");
  assertStringIncludes(m, "🚐 Ida de amanhã, quinta (12/11): sai de busca em casa e desce em Pirapemas · 2 passagens");
  assertStringIncludes(m, "📍 Me manda, por favor, o endereço onde a van te pega.");
  assert(!m.includes("Endereço a confirmar"));
});

Deno.test("ida e volta: em ordem, volta sem dia dito pergunta o dia", () => {
  const ida: ReservaParaConfirmar = {
    ...volta,
    direcao: "ida",
    pontoCodigo: "rodoviaria",
    pontoNome: "Rodoviária",
    detalhe: null,
    desembarque: "Cantanhede",
  };
  const v = { ...volta, detalhe: "Rua Grande · confirmar com o cliente se a volta é no mesmo dia", desembarque: null, aConfirmar: ["dia_da_volta"] };
  const m = mensagemDeConfirmacao([v, ida], { hoje: "2026-11-10", nome: "Ana" });
  assert(m);
  assertStringIncludes(m, "Suas vagas estão reservadas:");
  const [a, b] = [m.indexOf("🚐 Ida"), m.indexOf("🚐 Volta")];
  assert(a > 0 && b > a, m);
  assertStringIncludes(m, "sai de Rodoviária e desce em Cantanhede");
  assertStringIncludes(m, "sai de Pirapemas (Rua Grande) · 1 passagem");
  assertStringIncludes(m, "📅 A volta é no mesmo dia?");
});

Deno.test("vaga de outra pessoa e encomenda sem valor", () => {
  const m = mensagemDeConfirmacao(
    [{ ...volta, passageiro: "Maria" }, { ...volta, tipo: "encomenda", detalhe: null, desembarque: "São Luís" }],
    { hoje: HOJE, nome: "Ana" },
  );
  assert(m);
  assertStringIncludes(m, "🚐 Maria: Volta de hoje");
  assertStringIncludes(m, "📦 Encomenda na Volta de hoje, quarta (11/11), para São Luís");
  assertStringIncludes(m, "A equipe confirma com você o valor da encomenda.");
  assertEquals(mensagemDeConfirmacao([], { hoje: HOJE }), null);
});

Deno.test("#339: aviso de reserva atualizada pelo revisor", () => {
  const m = mensagemDeConfirmacao([volta], { hoje: HOJE, nome: "Ana Maria", atualizacao: true });
  assert(m);
  assertStringIncludes(m, "Ana, atualizei sua reserva. Ficou assim:");
  assertStringIncludes(m, "Se algo estiver diferente");
  const sem = mensagemDeConfirmacao([volta, { ...volta, direcao: "ida" }], { hoje: HOJE, atualizacao: true });
  assertStringIncludes(sem ?? "", "Atualizei suas reservas. Ficou assim:");
});
