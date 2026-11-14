// Issue #419 — Ida↔Volta trocadas nos casos reais da avaliação (endereços trocados por fictícios).
import { assert, assertEquals } from "jsr:@std/assert";
import {
  cidadeDoEnderecoEscrito,
  conferenciaFinal,
  origemEscrita,
  pedidosPelaOrigem,
  segundaViagemEhAOutra,
  voltaPeloEnderecoDoInterior,
} from "./pedidoDoCliente.ts";
import { idaPeloEmbarqueEmSaoLuis, type LugarNasCidades, sentidoPeloLugarDoEmbarque } from "./rascunhoPuro.ts";

type Lido = {
  tipo: string;
  data: string;
  direcao: string;
  ponto: string | null;
  bairro: string | null;
  endereco: string | null;
  desembarque: string | null;
  cidade_dita?: string | null;
  duvida?: string | null;
};

Deno.test("#419 endereço escrito em Pirapemas/Cantanhede: a cidade do embarque, não o destino", () => {
  // formulário com a cidade na linha de baixo do endereço
  assertEquals(
    cidadeDoEnderecoEscrito(["Fulana\nDia 15/11/26\nApenas 1 passageiro\nRua das Acácias 12 - Centro\nPirapemas (px ao hospital)\nVou ficar no Residencial Jardim Azul"])?.cidade,
    "pirapemas",
  );
  // cidade sozinha logo depois do endereço
  assertEquals(cidadeDoEnderecoEscrito(["1 pessoa", "Endereço Rua do Caju", "Cantanhede"]), { cidade: "cantanhede", linha: "Rua do Caju — Cantanhede" });
  // destino, nome de residencial e "sou de" não contam
  assertEquals(cidadeDoEnderecoEscrito(["Moro na Rua 10, Cohatrac", "vou pra Pirapemas amanhã"]), null);
  assertEquals(cidadeDoEnderecoEscrito(["Rua 5, Residencial Pirapemas"]), null);
  assertEquals(cidadeDoEnderecoEscrito(["sou de Cantanhede, moro na rua do sol"]), null);
  assertEquals(cidadeDoEnderecoEscrito(["Dia 15/11", "Pirapemas"]), null);
  // as duas cidades: não decide
  assertEquals(cidadeDoEnderecoEscrito(["Rua A 1, Pirapemas", "Rua B 2, Cantanhede"]), null);
});

Deno.test("#419 Ida 'busca em casa' com endereço do interior vira a Volta saindo de lá", () => {
  // o leitor pôs o residencial de São Luís como embarque e a cidade como destino
  const lido: Lido = { tipo: "passagem", data: "2026-11-15", direcao: "ida", ponto: "busca", bairro: "Anil", endereco: "Residencial Jardim Azul", desembarque: "Pirapemas" };
  const v = voltaPeloEnderecoDoInterior(lido, { cidade: "pirapemas", linha: "Rua das Acácias 12 - Centro — Pirapemas" }, "teste");
  assertEquals([v.direcao, v.ponto, v.bairro, v.cidade_dita, v.endereco, v.desembarque], [
    "volta",
    null,
    null,
    "pirapemas",
    "Rua das Acácias 12 - Centro — Pirapemas",
    "Residencial Jardim Azul, Anil",
  ]);
  // o leitor leu o endereço certo, só no sentido errado
  const certo: Lido = { ...lido, bairro: "Turu", endereco: "Rua do Caju — Cantanhede", desembarque: null };
  const c = voltaPeloEnderecoDoInterior(certo, { cidade: "cantanhede", linha: "Rua do Caju — Cantanhede" }, "teste");
  assertEquals([c.direcao, c.endereco, c.desembarque, c.bairro], ["volta", "Rua do Caju — Cantanhede", null, null]);
});

Deno.test("#419 lugar só conhecido no interior (3+ reservas) decide; com algo de São Luís, pergunta", () => {
  const rua: LugarNasCidades = { tipo: "rua", nome: "Avenida Exemplo", em_pirapemas: true, em_cantanhede: false, reservas_pirapemas: 7, reservas_cantanhede: 0 };
  assertEquals(sentidoPeloLugarDoEmbarque({ lugares: [rua], bairroDeSaoLuisEscrito: false, lugarDeSaoLuis: false }), {
    cidade: "pirapemas",
    nome: "Avenida Exemplo",
    reservas: 7,
  });
  assertEquals(sentidoPeloLugarDoEmbarque({ lugares: [rua], bairroDeSaoLuisEscrito: true, lugarDeSaoLuis: false }), "duvida");
  assertEquals(sentidoPeloLugarDoEmbarque({ lugares: [rua], bairroDeSaoLuisEscrito: false, lugarDeSaoLuis: true }), "duvida");
  // pouca prova, ou nas duas cidades: não decide
  assertEquals(sentidoPeloLugarDoEmbarque({ lugares: [{ ...rua, reservas_pirapemas: 1 }], bairroDeSaoLuisEscrito: false, lugarDeSaoLuis: false }), null);
  assertEquals(sentidoPeloLugarDoEmbarque({ lugares: [{ ...rua, em_cantanhede: true }], bairroDeSaoLuisEscrito: false, lugarDeSaoLuis: false }), null);
});

Deno.test("#419 'Pirapemas/ São Luís' é o trecho", () => {
  assertEquals(origemEscrita("Ainda tem vaga Pirapemas/ São Luís para amanhã?"), { sentido: "volta", de: "pirapemas", para: "sao luis" });
  assertEquals(origemEscrita("São Luís x Cantanhede"), { sentido: "ida", de: "sao luis", para: "cantanhede" });
  assertEquals(origemEscrita("Rua 10 / Centro"), null);
});

Deno.test("#419 ida e volta: a viagem que desce onde a outra embarca é a Volta (mesmo dia ou não)", () => {
  const ida: Lido = { tipo: "passagem", data: "2026-11-11", direcao: "ida", ponto: "busca", bairro: "Maioba", endereco: "Condomínio Bela Vista, bloco C", desembarque: "Cantanhede" };
  // "Na volta, onde lhe busco?" → "na Rua das Palmeiras": a leitura montou a Volta com o rótulo errado
  const voltaLidaComoIda: Lido = { ...ida, endereco: "Rua das Palmeiras, casa da dona Maria", desembarque: "Condomínio Bela Vista" };
  const textos = ["uma passagem para amanhã para cantanhede", "é ida e volta", "lá na rua das palmeiras"];
  const r = segundaViagemEhAOutra([ida, voltaLidaComoIda], textos);
  const volta = r.find((p) => p.endereco?.startsWith("Rua das Palmeiras"));
  assertEquals([volta?.direcao, volta?.ponto, volta?.bairro, volta?.cidade_dita, volta?.desembarque], ["volta", null, null, "cantanhede", "Condomínio Bela Vista"]);
  assertEquals(r.find((p) => p.endereco?.startsWith("Condomínio"))?.direcao, "ida");
  // dias diferentes, mesma coisa
  const r2 = segundaViagemEhAOutra([ida, { ...voltaLidaComoIda, data: "2026-11-12" }], ["segunda pra ir e terça pra volta"]);
  assertEquals(r2[1].direcao, "volta");
  // mesmo dia sem o sinal: não mexe
  assertEquals(segundaViagemEhAOutra([ida, { ...ida, endereco: "Outro lugar", desembarque: "Pirapemas" }], textos).map((p) => p.direcao), ["ida", "ida"]);
});

Deno.test("#419 o trecho dito vale para a viagem do dia dele, não para todas", () => {
  const lidos: Lido[] = [
    { tipo: "passagem", data: "2026-11-14", direcao: "ida", ponto: "outro", bairro: null, endereco: "Pedrinhas", desembarque: null },
    { tipo: "passagem", data: "2026-11-15", direcao: "volta", ponto: null, bairro: null, endereco: "Rua do Sol", desembarque: "São Luís" },
  ];
  assertEquals(pedidosPelaOrigem(lidos, { sentido: "volta", de: "pirapemas", para: "sao luis" }), lidos);
  // conferência final: o trecho do dia 15 não trava a Ida do dia 14
  const msgs = [
    { texto: "Marca uma passagem para o dia 14 no sábado de Pedrinhas", em: "2026-11-11T20:01:00Z" },
    { texto: "De Pirapemas a São Luís na Rua do Sol outra passagem por dia 15", em: "2026-11-11T20:02:00Z" },
  ];
  assertEquals(conferenciaFinal({ trip_date: "2026-11-14", direction: "ida", quantity: 1, route_point_code: "outro" }, msgs, { hoje: "2026-11-11", pedidosLidos: 2 }), []);
  assert(conferenciaFinal({ trip_date: "2026-11-15", direction: "ida", quantity: 1, route_point_code: "outro" }, msgs, { hoje: "2026-11-11", pedidosLidos: 2 }).length > 0);
});

Deno.test("#419 Volta que embarca na BR de São Luís é a Ida", () => {
  const locais = ["Pedrinhas", "Estiva", "Maracanã"];
  const lidos: Lido[] = [{ tipo: "passagem", data: "2026-11-14", direcao: "volta", ponto: "pirapemas", bairro: null, endereco: "BR — Pedrinhas", desembarque: "São Luís", cidade_dita: "pirapemas" }];
  const [p] = idaPeloEmbarqueEmSaoLuis(lidos, locais);
  assertEquals([p.direcao, p.ponto, p.endereco, p.desembarque, p.cidade_dita], ["ida", "outro", "Pedrinhas (BR)", null, null]);
  // embarque em Pirapemas: não mexe
  const certo = [{ ...lidos[0], endereco: "Rua do Sol, Pirapemas" }];
  assertEquals(idaPeloEmbarqueEmSaoLuis(certo, locais), certo);
});
