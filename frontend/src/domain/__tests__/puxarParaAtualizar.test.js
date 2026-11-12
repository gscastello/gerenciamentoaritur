import { describe, expect, it } from "vitest";
import {
  LIMIAR_PUXAO,
  PUXAO_MAXIMO,
  distanciaDoPuxao,
  puxaoAtualiza,
} from "../puxarParaAtualizar.js";

describe("puxar para atualizar (#353)", () => {
  it("o indicador desce metade do movimento, até o teto", () => {
    expect(distanciaDoPuxao(0)).toBe(0);
    expect(distanciaDoPuxao(-30)).toBe(0);
    expect(distanciaDoPuxao("x")).toBe(0);
    expect(distanciaDoPuxao(100)).toBe(50);
    expect(distanciaDoPuxao(1000)).toBe(PUXAO_MAXIMO);
  });
  it("só atualiza depois do limiar", () => {
    expect(puxaoAtualiza(LIMIAR_PUXAO - 1)).toBe(false);
    expect(puxaoAtualiza(LIMIAR_PUXAO)).toBe(true);
    expect(puxaoAtualiza(distanciaDoPuxao(2 * LIMIAR_PUXAO))).toBe(true);
  });
});
