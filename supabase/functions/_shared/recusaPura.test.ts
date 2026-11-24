import { assertEquals } from "jsr:@std/assert@1";
import { lotadaPelaEquipe, viagensLotadasPelaEquipe } from "./recusaPura.ts";

// domingo 22/11/2026
const f = (cw: number, quem: "cliente" | "equipe", texto: string, hora = "12:00") => ({ cw, quem, texto, em: `2026-11-22T${hora}:00Z` });
const chaves = (...l: ReturnType<typeof f>[]) => [...viagensLotadasPelaEquipe(l).keys()];

Deno.test("#527: a recusa da equipe fecha a viagem para o bot", () => {
  assertEquals(
    chaves(f(1, "cliente", "marcar uma passagem pra amanhã de São Luís indo pra pirapemas", "12:00"), f(1, "equipe", "Não temos mais vaga pra amanhã", "12:05")),
    ["2026-11-23|ida"],
  );
  // o dia vem do cliente quando a equipe não escreve
  assertEquals(chaves(f(1, "cliente", "Tem vaga pra pirapemas amanhã?"), f(1, "equipe", "Não temos mais vaga", "12:05")), ["2026-11-23|ida"]);
  // "só temos vaga pra terça" fecha o dia pedido, não a terça
  assertEquals(chaves(f(1, "cliente", "quero ir pra São Luís amanhã"), f(1, "equipe", "Só temos vaga pra terça feira", "12:05")), ["2026-11-23|volta"]);
});

Deno.test("#527: a última palavra da equipe vale, e dúvida não fecha nada", () => {
  const recusa = [f(1, "cliente", "vaga pra pirapemas amanhã?"), f(1, "equipe", "Não temos mais vaga", "12:05")];
  assertEquals(chaves(...recusa, f(2, "cliente", "tem vaga pra pirapemas amanhã?", "13:00"), f(2, "equipe", "Temos sim", "13:05")), []);
  // sem sentido, sem dia, ou pergunta da própria equipe
  assertEquals(chaves(f(1, "cliente", "tem vaga amanhã?"), f(1, "equipe", "Não temos mais vaga", "12:05")), []);
  assertEquals(chaves(f(1, "cliente", "tem vaga pra pirapemas?"), f(1, "equipe", "Não temos mais vaga", "12:05")), []);
  assertEquals(chaves(f(1, "cliente", "vaga pra pirapemas amanhã"), f(1, "equipe", "não tem mais vaga aí na sua van pra amanhã?", "12:05")), []);
  const lotadas = viagensLotadasPelaEquipe(recusa);
  assertEquals([lotadaPelaEquipe(lotadas, "2026-11-23", "ida"), lotadaPelaEquipe(lotadas, "2026-11-23", "volta")], [true, false]);
});
