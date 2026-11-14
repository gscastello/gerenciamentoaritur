import { assertEquals } from "jsr:@std/assert";
import { aplicarDadosDaMarca, dadosDaMarca } from "./marcaDaEquipe.ts";
import type { PedidoExtraido } from "./rascunhoPuro.ts";

// sexta 14/11/2026, 19h em São Luís
const SEXTA = "2026-11-14T22:00:00Z";
const ctx = {
  pontosIda: ["busca", "rodoviaria", "retorno", "outro"],
  bairros: [{ neighborhood: "Cohatrac" }, { neighborhood: "Turu" }, { neighborhood: "Cohab Anil III" }],
  locaisDeOutros: ["Estiva", "Pedrinhas", "Oleama", "Maracanã", "Aeroporto"],
};

Deno.test("#420 dados escritos pela equipe na marca", () => {
  assertEquals(dadosDaMarca("Agendado ☑️", SEXTA, ctx), {});
  assertEquals(dadosDaMarca("Agendado ☑️ seg Ida Estiva 2P", SEXTA, ctx), {
    data: "2026-11-16",
    direcao: "ida",
    quantidade: 2,
    ponto: "outro",
    local: "Estiva",
  });
  assertEquals(dadosDaMarca("Agendado ☑️ volta 17/11 cantanhede", SEXTA, ctx), {
    data: "2026-11-17",
    direcao: "volta",
    cidade: "cantanhede",
  });
  assertEquals(dadosDaMarca("Agendado ✅ amanhã ida rodoviária 3 passagens", SEXTA, ctx), {
    data: "2026-11-15",
    direcao: "ida",
    quantidade: 3,
    ponto: "rodoviaria",
  });
  assertEquals(dadosDaMarca("Agendado ☑️ dom ida Cohatrac", SEXTA, ctx).bairro, "Cohatrac");
});

Deno.test("#420 a marca vence a leitura", () => {
  // o bot leu domingo (dia não escrito); a equipe escreveu segunda
  const lido = [{ tipo: "passagem", data: "2026-11-15", direcao: "ida", ponto: "busca", bairro: "Areinha", endereco: "Av. Jaime Tavares" }];
  const [p] = aplicarDadosDaMarca(lido, dadosDaMarca("Agendado ☑️ segunda", SEXTA, ctx));
  assertEquals([p.data, p.direcao, p.ponto, p.bairro], ["2026-11-16", "ida", "busca", "Areinha"]);
  // busca em casa na Estiva → Outros (BR)
  const [b] = aplicarDadosDaMarca([{ ...lido[0], bairro: "Estiva", endereco: "Estiva" }], dadosDaMarca("Agendado ☑️ seg ida estiva", SEXTA, ctx));
  assertEquals([b.ponto, b.bairro, b.endereco], ["outro", null, "Estiva (BR)"]);
  // nada lido: a marca com dia e sentido monta o pedido
  const [m] = aplicarDadosDaMarca<PedidoExtraido>([], dadosDaMarca("Agendado ☑️ ter volta cantanhede 1p", SEXTA, ctx));
  assertEquals([m.data, m.direcao, m.cidade_dita, m.quantidade], ["2026-11-17", "volta", "cantanhede", 1]);
  // marca sem dados não mexe
  assertEquals(aplicarDadosDaMarca(lido, dadosDaMarca("Agendado ☑️", SEXTA, ctx)), lido);
  // vários pedidos: vale para o do dia citado
  const dois: PedidoExtraido[] = [lido[0], { tipo: "passagem", data: "2026-11-17", direcao: "volta", ponto: null }];
  const r = aplicarDadosDaMarca(dois, dadosDaMarca("Agendado ☑️ volta 17/11 pirapemas", SEXTA, ctx));
  assertEquals([r[0].ponto, r[1].cidade_dita], ["busca", "pirapemas"]);
});
