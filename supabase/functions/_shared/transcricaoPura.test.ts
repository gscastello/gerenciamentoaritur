import { assert, assertEquals } from "jsr:@std/assert@1";
import { contextoDaTranscricao } from "./transcricaoPura.ts";

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
