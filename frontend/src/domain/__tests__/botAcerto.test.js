import { describe, expect, it } from "vitest";
import {
  PERIODOS_DO_ACERTO,
  correcoesPorReserva,
  nivelDoAcerto,
  textoDaCorrecao,
  valorDaCorrecao,
} from "../botAcerto.js";

describe("nivelDoAcerto", () => {
  it("sem reservas no período", () => {
    expect(nivelDoAcerto(null, 0).nivel).toBe("sem_dados");
    expect(nivelDoAcerto(100, 0).nivel).toBe("sem_dados");
    expect(nivelDoAcerto(null, 5).nivel).toBe("sem_dados");
  });
  it("faixas: 95+ bom, 80–94 atenção, abaixo ruim", () => {
    expect(nivelDoAcerto(95, 20).nivel).toBe("bom");
    expect(nivelDoAcerto(100, 20).nivel).toBe("bom");
    expect(nivelDoAcerto(94, 20).nivel).toBe("atencao");
    expect(nivelDoAcerto(80, 20).nivel).toBe("atencao");
    expect(nivelDoAcerto(79, 20).nivel).toBe("ruim");
    expect(nivelDoAcerto(78, 32).texto).toBe(
      "Acerto baixo: confira as reservas do bot antes da viagem.",
    );
    expect(nivelDoAcerto(96, 32).texto).toBe(
      "Acerto alto: o bot está lançando como a equipe lançaria.",
    );
    expect(nivelDoAcerto(85, 32).texto).toBe(
      "Acerto médio: ainda vale conferir as reservas do bot.",
    );
    expect(nivelDoAcerto(null, 0).texto).toBe("Nenhuma reserva lançada pelo bot neste período.");
  });
});

describe("textos da correção", () => {
  it("valor em reais e vazio como travessão", () => {
    expect(valorDaCorrecao("valor", "60.00")).toMatch(/R\$\s?60,00/);
    expect(valorDaCorrecao("valor", "abc")).toBe("abc");
    expect(valorDaCorrecao("endereço", null)).toBe("—");
    expect(valorDaCorrecao("endereço", "  ")).toBe("—");
    expect(valorDaCorrecao("quantidade", 2)).toBe("2");
  });
  it("antes → depois", () => {
    expect(
      textoDaCorrecao({ campo: "dia/sentido", antes: "12/11 Ida", depois: "11/11 Volta" }),
    ).toBe("dia/sentido: 12/11 Ida → 11/11 Volta");
  });
});

describe("correcoesPorReserva", () => {
  it("junta por reserva na ordem em que aparecem", () => {
    const grupos = correcoesPorReserva([
      {
        reserva: "a",
        cliente: "Auristelia",
        viagem: "11/11 Volta",
        campo: "dia/sentido",
        antes: "12/11 Ida",
        depois: "11/11 Volta",
        por: "Gustavo",
        em: "2026-11-11T13:21:00Z",
      },
      {
        reserva: "a",
        cliente: "Auristelia",
        viagem: "11/11 Volta",
        campo: "embarque",
        antes: "Buscar em Casa",
        depois: "Pirapemas",
      },
      { reserva: "b", cliente: "", campo: "valor", antes: "80.00", depois: "60.00" },
      { reserva: null, campo: "x" },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({
      reserva: "a",
      cliente: "Auristelia",
      viagem: "11/11 Volta",
      por: "Gustavo",
    });
    expect(grupos[0].itens).toEqual([
      "dia/sentido: 12/11 Ida → 11/11 Volta",
      "embarque: Buscar em Casa → Pirapemas",
    ]);
    expect(grupos[1].cliente).toBe("Sem nome");
    expect(grupos[1].viagem).toBeNull();
    expect(grupos[1].por).toBeNull();
    expect(grupos[1].em).toBeNull();
    expect(correcoesPorReserva(undefined)).toEqual([]);
    expect(
      correcoesPorReserva([{ reserva: "c", cliente: "  Ana  ", campo: "rua" }])[0],
    ).toMatchObject({
      cliente: "Ana",
      itens: ["rua: — → —"],
    });
    expect(correcoesPorReserva([{ reserva: "d", campo: "rua" }])[0].cliente).toBe("Sem nome");
  });
  it("períodos oferecidos", () => {
    expect(PERIODOS_DO_ACERTO).toEqual([7, 30, 90]);
  });
});
