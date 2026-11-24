import { assertEquals } from "jsr:@std/assert";
import { esperadoNaHoraDaMarca, escritoPeloCliente, quemMudou } from "./mudancaDepoisDaMarca.ts";

const pontosIda = ["busca", "rodoviaria", "retorno", "postocarone", "outro"];
const msg = (texto: string, hora = "15:00") => ({ texto, em: `2026-11-23T${hora}:00-03:00` });
const base = { direcao: "ida" as const, pontosIda };

Deno.test("#504 caso 8bfa7860: escreveu Rodoviária antes e Retorno depois = mudou de ideia", () => {
  assertEquals(
    quemMudou({
      ...base,
      campo: "ponto",
      antes: "rodoviaria",
      depois: "retorno",
      antesDaMarca: [msg("Quero três passagens pra amanhã", "12:37"), msg("Pra pirapemas", "12:37"), msg("Vou ficar ma rodoviária esperando vcs", "12:37")],
      depoisDaMarca: [msg("Boa tarde", "16:53"), msg("É no retorno viu", "16:53")],
    }),
    "mudou_de_ideia",
  );
});

Deno.test("#504 já tinha escrito o valor que ficou: o bot leu errado", () => {
  assertEquals(
    quemMudou({
      ...base,
      campo: "ponto",
      antes: "rodoviaria",
      depois: "retorno",
      antesDaMarca: [msg("Vou esperar no retorno")],
      depoisDaMarca: [msg("Moço, eu disse retorno")],
    }),
    "erro_de_leitura",
  );
  // quantidade: escreveu 2 antes, o bot pôs 1, depois a equipe acertou
  assertEquals(
    quemMudou({ ...base, campo: "quantidade", antes: 1, depois: 2, antesDaMarca: [msg("duas passagens")], depoisDaMarca: [msg("ok")] }),
    "erro_de_leitura",
  );
});

Deno.test("#504 sem o valor escrito: as palavras do cliente decidem; sem prova, incerto", () => {
  // "na verdade" + o valor novo escrito depois = mudou de ideia
  assertEquals(
    quemMudou({ ...base, campo: "quantidade", antes: 1, depois: 2, antesDaMarca: [msg("tem vaga amanhã?")], depoisDaMarca: [msg("na verdade são 2 passagens")] }),
    "mudou_de_ideia",
  );
  // "tá errado" = erro de leitura
  assertEquals(
    quemMudou({ ...base, campo: "ponto", antes: "rodoviaria", depois: "retorno", antesDaMarca: [msg("tem vaga amanhã?")], depoisDaMarca: [msg("tá errado moço")] }),
    "erro_de_leitura",
  );
  // ninguém escreveu nada sobre o campo: não chuta
  assertEquals(
    quemMudou({ ...base, campo: "ponto", antes: "rodoviaria", depois: "retorno", antesDaMarca: [msg("tem vaga amanhã?")], depoisDaMarca: [msg("ok obrigado")] }),
    "incerto",
  );
  // "mudei" sem dizer o valor novo: pode ser outro campo — incerto
  assertEquals(
    quemMudou({ ...base, campo: "ponto", antes: "rodoviaria", depois: "retorno", antesDaMarca: [msg("tem vaga amanhã?")], depoisDaMarca: [msg("mudei o horário")] }),
    "incerto",
  );
});

Deno.test("#504 dia, sentido e a cidade da Volta pelo que ele escreveu", () => {
  assertEquals(escritoPeloCliente("dia", [msg("quero ir dia 25")], base), "2026-11-25");
  assertEquals(escritoPeloCliente("sentido", [msg("vaga pra São Luís")], base), "volta");
  assertEquals(escritoPeloCliente("ponto", [msg("Rua do Cajueiro, Cantanhede")], { ...base, direcao: "volta" }), "cantanhede");
  // dia: amanhã antes, "na verdade é dia 26" depois = mudou de ideia
  assertEquals(
    quemMudou({
      ...base,
      campo: "dia",
      antes: "2026-11-24",
      depois: "2026-11-26",
      antesDaMarca: [msg("passagem pra amanhã")],
      depoisDaMarca: [msg("na verdade é dia 26", "18:00")],
    }),
    "mudou_de_ideia",
  );
});

Deno.test("#504 o esperado da hora do Agendado: só a mudança de ideia volta o valor de antes", () => {
  const esperado = [{ reservation_id: "r1", route_point_code: "retorno", quantity: 1, trip_date: "2026-11-24", direction: "ida" }];
  const r = esperadoNaHoraDaMarca(esperado, [
    { reservation_id: "r1", campo: "ponto", antes: "rodoviaria", depois: "retorno", quem: "mudou_de_ideia" },
    { reservation_id: "r1", campo: "quantidade", antes: 2, depois: 1, quem: "erro_de_leitura" },
    { reservation_id: "r2", campo: "dia", antes: "2026-11-25", depois: "2026-11-26", quem: "mudou_de_ideia" },
  ]);
  assertEquals(r.esperado[0].route_point_code, "rodoviaria");
  assertEquals(r.esperado[0].quantity, 1);
  assertEquals(r.ajustes.length, 1);
  assertEquals(r.incertos, []);
  const incerto = esperadoNaHoraDaMarca(esperado, [{ reservation_id: "r1", campo: "ponto", antes: "rodoviaria", depois: "retorno", quem: "incerto" }]);
  assertEquals(incerto.esperado[0].route_point_code, "retorno");
  assertEquals(incerto.incertos, ["ponto: rodoviaria → retorno"]);
});
