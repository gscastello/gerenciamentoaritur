import { assert, assertEquals } from "jsr:@std/assert@1";
import { contextoDaTranscricao, ehEcoDoContexto } from "./transcricaoPura.ts";

Deno.test("#499: a transcrição recebe as ruas conhecidas, sem repetir e com limite", () => {
  const t = contextoDaTranscricao(["Rua Eurico Ribeiro", "rua eurico  ribeiro", null, "", "Rua", "Praça da Cruz"]);
  assert(t.includes("Rua Eurico Ribeiro, Praça da Cruz."));
  assertEquals(t.match(/eurico/gi)?.length, 1);
  assert(t.startsWith("Mensagem de WhatsApp"));
  const muitas = Array.from({ length: 100 }, (_, i) => `Rua Número ${i}`);
  assertEquals(contextoDaTranscricao(muitas, 10).split("Rua Número").length - 1, 10);
  // sem a base, vai só o vocabulário de sempre
  assert(!contextoDaTranscricao([]).includes("Ruas e lugares"));
});

Deno.test("#520: o vocabulário devolvido no lugar da fala é eco; fala de verdade não é", () => {
  const contexto = contextoDaTranscricao(["Rua das Flores", "Praça da Cruz", "Rua do Sol", "Rua da Areia", "Travessa Um"]);
  assert(ehEcoDoContexto(contexto, contexto));
  assert(ehEcoDoContexto("Mensagem de WhatsApp de um passageiro da Aritur, vans e ônibus", contexto));
  assert(ehEcoDoContexto("Rua das Flores, Praça da Cruz, Rua do Sol, Rua da Areia, Travessa Um.", contexto));
  for (
    const fala of [
      "Oi Seu Ari, quero uma passagem amanhã de Pirapemas para São Luís",
      "É na Rua das Flores, perto da Praça da Cruz",
      "Rua do Sol",
      "quero ida e volta, vou hoje e volto amanhã, me pega na Rodoviária",
      "",
    ]
  ) assertEquals(ehEcoDoContexto(fala, contexto), false, fala);
});
