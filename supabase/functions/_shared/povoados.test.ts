import { assertEquals } from "jsr:@std/assert";
import { areaDoDesembarque } from "./agentePuro.ts";
import { povoadoDoCaminho } from "./grafia.ts";
import { paradaDoInterior } from "./ladoDaRota.ts";
import { origemEscrita, pedidosPelaOrigem, pontoDaVoltaPelaOrigem, sentidoDoTrecho, sentidoEscrito } from "./pedidoDoCliente.ts";
import { cidadeDaVoltaPelasPistas, cidadeDoCaminhoNoTexto, idaPeloEmbarqueEmSaoLuis } from "./rascunhoPuro.ts";

const chave = (t: string, campo = false) => povoadoDoCaminho(t, campo)?.chave ?? null;

Deno.test("#512: Palmeiral é lugar; 'Vila Palmeira' (bairro de São Luís) não é", () => {
  assertEquals(chave("saindo do povoado palmeiral"), "palmeiral");
  assertEquals(chave("2 pessoas pra São Luís Palmeiral"), "palmeiral");
  assertEquals(chave("Vila Palmeira"), null);
  assertEquals(chave("Parque das Palmeiras", true), null);
  assertEquals(chave("Vila Palmeiral", true), null);
  assertEquals(cidadeDoCaminhoNoTexto("Vila Palmeira"), null);
});

Deno.test("#512: 'vou sozinho' não é o povoado", () => {
  for (const t of ["vou sozinho", "Sozinho", "eu vou viajar sozinho amanhã", "ele vai sozinho no ônibus", "sou só eu, sozinho mesmo"]) {
    assertEquals(chave(t), null, t);
  }
  for (const t of ["até o povoado Sozinho", "De Cantanhede pro sozinho", "Passando aqui no sozinho", "do sozinho pra são luis"]) {
    assertEquals(chave(t), "povoado sozinho", t);
  }
  // campo de endereço já separado pela leitura
  assertEquals(chave("Sozinho", true), "povoado sozinho");
  assertEquals(chave("Sozinho, casa amarela", true), "povoado sozinho");
  assertEquals(chave("Rua da Paz, mora sozinho", true), null);
});

Deno.test("#512: sentido pela ordem das paradas", () => {
  const de = (t: string) => {
    const o = origemEscrita(t);
    return o ? [o.sentido, o.de, o.para] : null;
  };
  assertEquals(de("Do palmeiral pra São luis"), ["volta", "palmeiral", "sao luis"]);
  assertEquals(de("De São Luís pro povoado Palmeiral"), ["ida", "sao luis", "palmeiral"]);
  assertEquals(de("De Cantanhede pro sozinho"), ["volta", "cantanhede", "povoado sozinho"]);
  assertEquals(de("saindo do povoado sozinho para Pirapemas"), ["ida", "povoado sozinho", "pirapemas"]);
  assertEquals(de("Palmeiral / São Luís"), ["volta", "palmeiral", "sao luis"]);
  assertEquals(de("de Matões para Palmeiral"), ["ida", "matoes", "palmeiral"]);
  assertEquals(sentidoDoTrecho("palmeiral", "povoado sozinho"), null);
  assertEquals(de("vou de São Luís sozinho"), null);
});

Deno.test("#512: na Volta, ponto Cantanhede com o povoado no embarque", () => {
  assertEquals(pontoDaVoltaPelaOrigem("palmeiral"), "cantanhede");
  assertEquals(pontoDaVoltaPelaOrigem("povoado sozinho"), "cantanhede");
  assertEquals(cidadeDoCaminhoNoTexto("Palmeiral")?.ponto, "cantanhede");
  const p = cidadeDaVoltaPelasPistas({ textoDoEmbarque: "Sozinho", lugares: [], historico: ["pirapemas"], textosAntigos: [] });
  assertEquals(p?.cidade, "cantanhede");
  assertEquals(p?.aviso.includes("mesmo valor"), true);
  assertEquals(paradaDoInterior("Palmeiral"), "palmeiral");
  assertEquals(paradaDoInterior("Povoado Sozinho"), "povoado sozinho");
});

Deno.test("#512: Volta que embarca no povoado não vira Ida", () => {
  const pedido = { tipo: "passagem", data: "2026-11-25", direcao: "volta", endereco: "Palmeiral, BR", desembarque: "Retorno" };
  // deno-lint-ignore no-explicit-any
  assertEquals((idaPeloEmbarqueEmSaoLuis([pedido as any], ["BR"])[0] as any).direcao, "volta");
});

Deno.test("#512: a área do desembarque reconhece os povoados", () => {
  const areas = [{ code: "palmeiral", label: "Palmeiral" }, { code: "povoado_sozinho", label: "Povoado Sozinho" }, { code: "cantanhede", label: "Cantanhede" }];
  assertEquals(areaDoDesembarque("Palmeiral", areas), "palmeiral");
  assertEquals(areaDoDesembarque("Sozinho", areas), "povoado_sozinho");
  assertEquals(areaDoDesembarque("Povoado Sozinho, escola", areas), "povoado_sozinho");
  assertEquals(areaDoDesembarque("Vila Palmeira", areas), null);
});

Deno.test("#515: Periz é parada (antes de Bacabeira), não Pirapemas", () => {
  const de = (t: string) => {
    const o = origemEscrita(t);
    return o ? [o.sentido, o.de, o.para] : null;
  };
  assertEquals(de("De periz pra pirapemas?"), ["ida", "periz", "pirapemas"]);
  assertEquals(de("de Peris pra Pirapema"), ["ida", "periz", "pirapemas"]);
  assertEquals(de("Pirapemas / Periz de Baixo"), ["volta", "pirapemas", "periz"]);
  assertEquals(de("de Cantanhede para Perizes"), ["volta", "cantanhede", "periz"]);
  assertEquals(de("de São Luís pra Periz"), ["ida", "sao luis", "periz"]);
  // a Volta lida por engano vira a Ida em Outros, com Periz no embarque
  const lido = { tipo: "passagem", data: "2026-11-25", direcao: "volta", cidade_dita: "pirapemas", endereco: null, desembarque: null };
  // deno-lint-ignore no-explicit-any
  const [p] = pedidosPelaOrigem([lido as any], origemEscrita("De periz pra pirapemas?")) as any[];
  assertEquals([p.direcao, p.ponto, p.endereco, p.desembarque], ["ida", "outro", "Periz", "Pirapemas"]);
});

Deno.test("#514: 'pra ir sao Luís' é a Volta; 'ir Pirapemas' é a Ida", () => {
  assertEquals(sentidoEscrito(["Ainda tem vaga pra ir sao Luís?"]), "volta");
  assertEquals(sentidoEscrito(["vou Pirapemas amanhã"]), "ida");
  assertEquals(sentidoEscrito(["quero ir pra São Luís"]), "volta");
  assertEquals(sentidoEscrito(["vaga pra ir amanhã"]), "ida");
});
