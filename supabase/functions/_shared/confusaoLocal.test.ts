import { assertEquals } from "jsr:@std/assert";
import { detectarConfusao, lugarCitado, mensagemLadoErrado, regiaoDoLado } from "./confusaoLocal.ts";

// Volta: embarca em Cantanhede/Pirapemas, desembarca em São Luís.
const EMBARQUE_VOLTA = [
  { codigo: "cantanhede", nome: "Cantanhede" },
  { codigo: "pirapemas", nome: "Pirapemas" },
];
const DESEMBARQUE_VOLTA = [
  { codigo: "br", nome: "BR (ponto de referência)" },
  { codigo: "retorno", nome: "Retorno" },
  { codigo: "rodoviaria", nome: "Rodoviária" },
  { codigo: "casa", nome: "Em casa (bairro)" },
];
// Ida: embarca em São Luís, desembarca em Cantanhede/Pirapemas.
const EMBARQUE_IDA = [
  { codigo: "busca", nome: "Buscar em casa" },
  { codigo: "rodoviaria", nome: "Rodoviária" },
  { codigo: "retorno", nome: "Retorno" },
  { codigo: "postocarone", nome: "Posto Carone" },
];
const DESEMBARQUE_IDA = [
  { codigo: "cantanhede", nome: "Cantanhede" },
  { codigo: "pirapemas", nome: "Pirapemas" },
  { codigo: "outro", nome: "Outros locais" },
];

Deno.test("o caso real: na Volta, pedimos o endereço de embarque e ele responde 'retorno'", () => {
  const c = detectarConfusao({ texto: "retorno", proprios: EMBARQUE_VOLTA, outros: DESEMBARQUE_VOLTA });
  assertEquals(c?.lugar.codigo, "retorno");
});

Deno.test("aceita variações com palavras de ligação e 'de São Luís'", () => {
  for (const t of ["no retorno", "Retorno!", "na Rodoviária", "rodoviária de São Luís", "é no retorno mesmo"]) {
    assertEquals(
      detectarConfusao({ texto: t, proprios: EMBARQUE_VOLTA, outros: DESEMBARQUE_VOLTA }) !== null,
      true,
      t,
    );
  }
});

Deno.test("endereço de verdade não dispara (mais palavras que o nome do local)", () => {
  for (const t of ["Rua da Rodoviária, 12", "perto do retorno da BR", "Rua das Flores 7", "Povoado Santa Luzia"]) {
    assertEquals(
      detectarConfusao({ texto: t, proprios: EMBARQUE_VOLTA, outros: DESEMBARQUE_VOLTA }),
      null,
      t,
    );
  }
});

Deno.test("resposta do lado certo não é confusão", () => {
  assertEquals(detectarConfusao({ texto: "Pirapemas", proprios: EMBARQUE_VOLTA, outros: DESEMBARQUE_VOLTA }), null);
  assertEquals(detectarConfusao({ texto: "Rodoviária", proprios: DESEMBARQUE_VOLTA, outros: EMBARQUE_VOLTA }), null);
});

Deno.test("Volta, desembarque: citar Pirapemas/Cantanhede é trocar com o embarque", () => {
  const c = detectarConfusao({ texto: "em Pirapemas", proprios: DESEMBARQUE_VOLTA, outros: EMBARQUE_VOLTA });
  assertEquals(c?.lugar.codigo, "pirapemas");
});

Deno.test("Ida, embarque em São Luís: responder 'Cantanhede' (destino) é confusão", () => {
  const c = detectarConfusao({ texto: "Cantanhede", proprios: EMBARQUE_IDA, outros: DESEMBARQUE_IDA });
  assertEquals(c?.lugar.codigo, "cantanhede");
});

Deno.test("Ida, desembarque: 'posto carone' e 'rodoviária' são locais de embarque", () => {
  assertEquals(
    detectarConfusao({ texto: "posto carone", proprios: DESEMBARQUE_IDA, outros: EMBARQUE_IDA })?.lugar.codigo,
    "postocarone",
  );
  assertEquals(
    detectarConfusao({ texto: "rodoviaria", proprios: DESEMBARQUE_IDA, outros: EMBARQUE_IDA })?.lugar.codigo,
    "rodoviaria",
  );
});

Deno.test("códigos genéricos (casa, outro, busca) nunca contam como confusão", () => {
  assertEquals(lugarCitado("casa", DESEMBARQUE_VOLTA), null);
  assertEquals(lugarCitado("outros locais", DESEMBARQUE_IDA), null);
  assertEquals(lugarCitado("buscar em casa", EMBARQUE_IDA), null);
});

Deno.test("cidade nova cadastrada é reconhecida pelo nome", () => {
  const novas = [{ codigo: "matoes", nome: "Matões do Norte" }];
  assertEquals(lugarCitado("matões do norte", novas)?.codigo, "matoes");
});

Deno.test("mensagem de correção explica o lado e repete a pergunta", () => {
  const m = mensagemLadoErrado({
    lado: "embarque",
    lugar: { codigo: "retorno", nome: "Retorno" },
    direcao: "volta",
    pergunta: "Qual o endereço onde vamos te buscar em Pirapemas?",
  });
  assertEquals(
    m,
    "Só para confirmar: *Retorno* é um local de *desembarque*, e agora eu preciso do local de *embarque* " +
      "(de onde você vai sair, em Cantanhede, Pirapemas ou região). Qual o endereço onde vamos te buscar em Pirapemas?",
  );
});

Deno.test("regiaoDoLado por direção", () => {
  assertEquals(regiaoDoLado("ida", "embarque"), "São Luís");
  assertEquals(regiaoDoLado("volta", "desembarque"), "São Luís");
  assertEquals(regiaoDoLado("ida", "desembarque"), "Cantanhede, Pirapemas ou região");
});
