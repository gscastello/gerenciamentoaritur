import { assertEquals } from "jsr:@std/assert@1";
import { nomeOuSaudacao, nomeParaChamar } from "./nomeParaChamar.ts";

Deno.test("#535: só chama pelo nome de verdade", () => {
  assertEquals(nomeParaChamar("Auristelia Coutinho"), "Auristelia");
  assertEquals(nomeParaChamar("dona maria"), "Dona Maria");
  assertEquals(nomeParaChamar("Seu Antônio"), "Seu Antônio");
  assertEquals(nomeParaChamar("Irmão Zé Carlos"), "Irmão Zé");
  for (
    const semNome of [
      "", null, undefined, "Passageiro (campestre)", "Passageira", "passageiro(a)", "Mãe do Exemplo", "Irmã de Exemplo", "Esposa do Exemplo",
      "estrada matões próx a cx d'água", "Rua do Sol", "98 99999-0000", "Praça", "(Cohatrac)",
    ]
  ) assertEquals(nomeParaChamar(semNome), null, String(semNome));
});

Deno.test("#535: no modelo da Meta, sem nome vai a saudação da hora", () => {
  assertEquals(nomeOuSaudacao("Maria Silva", new Date("2026-11-25T14:00:00Z")), "Maria");
  assertEquals(nomeOuSaudacao("Passageiro (x)", new Date("2026-11-25T11:00:00Z")), "bom dia");
  assertEquals(nomeOuSaudacao(null, new Date("2026-11-25T18:00:00Z")), "boa tarde");
  assertEquals(nomeOuSaudacao("", new Date("2026-11-25T22:00:00Z")), "boa noite");
});
