import { assertEquals } from "jsr:@std/assert@1";
import { horasMaisCedo } from "./feriados.ts";

Deno.test("#529: segunda de feriado sai no horário normal e a terça sai mais cedo", () => {
  assertEquals(horasMaisCedo("2026-11-23", 1), 1);
  assertEquals(horasMaisCedo("2026-11-24", 1), 0);
  // Finados numa segunda
  assertEquals(horasMaisCedo("2026-11-02", 1), 0);
  assertEquals(horasMaisCedo("2026-11-03", 1), 1);
  assertEquals(horasMaisCedo("2026-11-04", 1), 0);
  // feriado a mais, cadastrado
  assertEquals(horasMaisCedo("2027-02-08", 1, ["2027-02-08"]), 0);
  assertEquals(horasMaisCedo("2027-02-09", 1, ["2027-02-08"]), 1);
});
