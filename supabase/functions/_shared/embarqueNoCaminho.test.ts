import { assertEquals } from "jsr:@std/assert@1";
import { embarqueNoCaminhoDe } from "./embarqueNoCaminho.ts";
import { textoDoLembrete } from "./lembretePuro.ts";

const em = (ponto: string, detalhe: string | null, direcao: "ida" | "volta" = "volta") => {
  const e = embarqueNoCaminhoDe({ direcao, ponto, detalhe }, null);
  return e ? [e.nome, e.hora, e.detalhe] : null;
};

Deno.test("#533: Campestre, Matões e Miranda têm o horário do cronograma, não o do ponto", () => {
  assertEquals(em("pirapemas", "Campestre"), ["Campestre", "13:00", null]);
  assertEquals(em("pirapemas", "Campestre, povoado Mata"), ["Campestre", "13:00", "povoado Mata"]);
  assertEquals(em("pirapemas", "Campestre (povoado Mata)"), ["Campestre", "13:00", "povoado Mata"]);
  assertEquals(em("cantanhede", "Matões do Norte, na praça"), ["Matões do Norte", "14:00", "na praça"]);
  assertEquals(em("cantanhede", "Miranda"), ["Miranda do Norte", "14:00", null]);
  assertEquals(em("outro", "Entroncamento", "ida"), ["Entroncamento", "07:30", null]);
});

Deno.test("#533: rua com nome de cidade, a própria cidade e os outros pontos ficam como estão", () => {
  assertEquals(em("pirapemas", "Estrada Matões, em frente ao posto"), null);
  assertEquals(em("pirapemas", "Rua do Exemplo"), null);
  assertEquals(em("cantanhede", "Vila Exemplo, Cantanhede"), null);
  assertEquals(em("busca", "Campestre", "ida"), null);
  assertEquals(em("retorno", null, "ida"), null);
});

Deno.test("#533: o lembrete diz o lugar e a hora de quem embarca no caminho", () => {
  const texto = textoDoLembrete(
    {
      id: "1", data: "2026-11-30", direcao: "volta", status: "confirmada", tipo: "passagem", criadaEm: "", peloAgendado: false,
      pontoCodigo: "pirapemas", pontoNome: "Campestre", pontoHora: "13:00", nome: null, bairro: null, endereco: "povoado Mata", quantidade: 2,
    },
    "13:00",
    "2026-11-30",
  );
  assertEquals(texto.includes("embarque em Campestre (povoado Mata) a partir das 13:00"), true, texto);
});
