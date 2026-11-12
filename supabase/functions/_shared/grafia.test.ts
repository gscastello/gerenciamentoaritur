import { assert, assertEquals } from "jsr:@std/assert";
import { distancia, distanciaDeGrafia, nomeParecidoNoTexto, palavraParecida, semLogradouros, temDataNoTexto } from "./grafia.ts";
import { bairroParecido } from "./agentePuro.ts";
import { cidadeDaVolta, pareceTerPedido } from "./rascunhoPuro.ts";

Deno.test("distância: troca, falta, sobra e letras invertidas contam 1", () => {
  assertEquals(distancia("lister", "listre"), 1); // invertidas
  assertEquals(distancia("caldas", "caudas"), 1); // trocada
  assertEquals(distancia("maraja", "marja"), 1); // faltando
  assertEquals(distancia("turu", "turuu"), 1); // sobrando
  assertEquals(distancia("igual", "igual"), 0);
});

Deno.test("palavra parecida: palavra curta tem de ser igual (issue #276)", () => {
  assert(palavraParecida("catanhede", "cantanhede"));
  assert(palavraParecida("pirapema", "pirapemas"));
  assert(palavraParecida("piraprmas", "pirapemas"));
  assert(!palavraParecida("lia", "bia"));
  assert(!palavraParecida("luz", "cruz"));
});

Deno.test("grafia de nome: palavra por palavra, sem partículas, até 2 erros", () => {
  assertEquals(distanciaDeGrafia("listre caldas", "Lister Caldas"), 1);
  assertEquals(distanciaDeGrafia("beira rio", "Beira do Rio"), 0);
  assertEquals(distanciaDeGrafia("choparia do riba", "Choperia do Riba"), 1);
  assertEquals(distanciaDeGrafia("muacir andrade", "Moacir Andrade"), 1);
  assertEquals(distanciaDeGrafia("bar da lia", "Bar da Bia"), null);
  assertEquals(distanciaDeGrafia("praca da luz", "Praça da Cruz"), null);
  assertEquals(distanciaDeGrafia("lister", "Lister Caldas"), null); // número de palavras diferente
});

Deno.test("nome parecido no texto: exato vence, empate não chuta", () => {
  const bairros = [{ neighborhood: "Cohatrac" }, { neighborhood: "Cohama" }, { neighborhood: "Cohab Anil" }, { neighborhood: "Anil" }];
  assertEquals(nomeParecidoNoTexto("moro no cohatrc perto da praça", bairros, (b) => b.neighborhood)?.item.neighborhood, "Cohatrac");
  assertEquals(nomeParecidoNoTexto("cohab anil", bairros, (b) => b.neighborhood)?.item.neighborhood, "Cohab Anil");
  assertEquals(nomeParecidoNoTexto("conjunto x", bairros, (b) => b.neighborhood), null);
  const gemeos = [{ neighborhood: "Vila Lobão" }, { neighborhood: "Vila Lobos" }];
  assertEquals(nomeParecidoNoTexto("vila lobao", gemeos, (b) => b.neighborhood)?.item.neighborhood, "Vila Lobão");
  assertEquals(nomeParecidoNoTexto("vila lobo", gemeos, (b) => b.neighborhood), null);
});

Deno.test("bairro de São Luís com erro de escrita (issue #276)", () => {
  const tabela = [{ neighborhood: "Cohatrac", price: 85 }, { neighborhood: "Bequimão", price: 80 }, { neighborhood: "Turu", price: 80 }];
  assertEquals(bairroParecido("Cohatrc", tabela)?.bairro.neighborhood, "Cohatrac");
  assertEquals(bairroParecido("bequimao", tabela), null); // sem acento é o nome exato (bairroDaTabela já acha)
  assertEquals(bairroParecido("bequimão", tabela), null);
  assertEquals(bairroParecido("Turuu", tabela)?.bairro.neighborhood, "Turu");
  assertEquals(bairroParecido("Maiobão", tabela), null);
});

Deno.test("data escrita do jeito do cliente: abreviação e erro contam (issue #276)", () => {
  for (const t of ["tem vaga hj?", "amnh cedo", "pra amanha", "sesta feira", "sabdo", "qinta", "dia 12", "12/11", "semana q vem"]) {
    assert(temDataNoTexto(t), t);
  }
  for (const t of ["boa noite", "quanto custa a passagem?", "ok obrigado"]) assert(!temDataNoTexto(t), t);
  assert(pareceTerPedido(["Boa noite", "tem vaga amnh pra sao luis?"]));
});

Deno.test("cidade da volta com erro de escrita (issue #276)", () => {
  assertEquals(cidadeDaVolta("pirapema"), "pirapemas");
  assertEquals(cidadeDaVolta("Catanhede"), "cantanhede");
  assertEquals(cidadeDaVolta("saindo de cantanedi"), "cantanhede");
  assertEquals(cidadeDaVolta("Rua Lister Caldas"), null);
  assertEquals(cidadeDaVolta("pirapemas ou cantanhede"), null);
});

Deno.test("#341: rua com nome de cidade não é a cidade", () => {
  assertEquals(semLogradouros("Rua Santa Rita de Cássia, N° 28 - Vila Isabel").includes("santa rita"), false);
  assertEquals(semLogradouros("R. Miranda 10").includes("miranda"), false);
  assertEquals(semLogradouros("Av Colombo, perto do posto").includes("colombo"), false);
  assertEquals(semLogradouros("Santa Rita, perto do posto").includes("santa rita"), true);
  assertEquals(semLogradouros("Rua Grande, em Bacabeira").includes("bacabeira"), true);
  assertEquals(semLogradouros("Vila Isabel Cafeteira").includes("vila isabel cafeteira"), true);
});
