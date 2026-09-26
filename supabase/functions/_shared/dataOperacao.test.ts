// Regressão (docs/AUDITORIA-2026-09-08.md §3.3-L): o bot calculava "hoje"
// em UTC (`new Date().toISOString().slice(0,10)`), o que resolvia datas
// relativas ("hoje", "amanhã") um dia adiantado entre ~21h e meia-noite
// em São Luís. `hojeSaoLuis()` precisa sempre devolver o dia civil de
// São Luís (UTC-3 o ano inteiro), não o de UTC.
import { assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { hojeSaoLuis } from "./dataOperacao.ts";

Deno.test("antes das 21h em São Luís, calcula o dia certo", () => {
  // 20h em São Luís (UTC-3) = 23h UTC, mesmo dia
  using _time = new FakeTime("2026-09-21T23:00:00.000Z");
  assertEquals(hojeSaoLuis(), "2026-09-21");
});

Deno.test("às 23h30 em São Luís, NÃO pula pro dia seguinte (bug do UTC corrigido)", () => {
  // 23h30 em São Luís (UTC-3) = 02h30 UTC do dia seguinte
  using _time = new FakeTime("2026-09-22T02:30:00.000Z");
  assertEquals(hojeSaoLuis(), "2026-09-21");
  // conferindo que o bug realmente existiria com o cálculo antigo (UTC puro)
  const diaComBugAntigo = new Date().toISOString().slice(0, 10);
  assertEquals(diaComBugAntigo, "2026-09-22"); // um dia adiantado — era o bug
});

Deno.test("à meia-noite em São Luís, já é o novo dia civil", () => {
  // 00h05 em São Luís (UTC-3) = 03h05 UTC
  using _time = new FakeTime("2026-09-22T03:05:00.000Z");
  assertEquals(hojeSaoLuis(), "2026-09-22");
});
