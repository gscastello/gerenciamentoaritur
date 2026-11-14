import { describe, expect, it } from "vitest";
import { destinoDoArrasto } from "../useArrastarParaOrdenar.js";

// três linhas de 60 px empilhadas: a (0–60), b (60–120), c (120–180)
const R = {
  a: { top: 0, height: 60 },
  b: { top: 60, height: 60 },
  c: { top: 120, height: 60 },
};
const ordem = ["a", "b", "c"];

describe("arrastar para ordenar (issue #413)", () => {
  it("só troca ao passar da metade da vizinha", () => {
    expect(destinoDoArrasto(ordem, "a", 80, R)).toBeNull(); // ainda antes da metade de b
    expect(destinoDoArrasto(ordem, "a", 95, R)).toBe("b");
    expect(destinoDoArrasto(ordem, "c", 100, R)).toBeNull();
    expect(destinoDoArrasto(ordem, "c", 85, R)).toBe("b");
  });
  it("arrasto longo vai direto ao lugar mais distante passado", () => {
    expect(destinoDoArrasto(ordem, "a", 170, R)).toBe("c");
    expect(destinoDoArrasto(ordem, "c", 10, R)).toBe("a");
  });
  it("id fora da lista não mexe", () => {
    expect(destinoDoArrasto(ordem, "x", 10, R)).toBeNull();
  });
});
