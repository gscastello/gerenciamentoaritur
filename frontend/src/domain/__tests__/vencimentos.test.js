import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_DE_VENCIMENTO,
  RECORRENCIAS,
  ordenarVencimentos,
  situacaoDoVencimento,
  textoDaSituacao,
  vencimentoDoForm,
} from "../vencimentos.js";

// Calendário de vencimentos (issues #366 e #369).
const hoje = "2026-11-12";
const v = (id, vence_em, extra = {}) => ({
  id,
  vence_em,
  avisar_dias: 15,
  quitado_em: null,
  ...extra,
});

describe("situação", () => {
  it("vencido, no prazo de aviso, em dia e quitado", () => {
    expect(situacaoDoVencimento(v("a", "2026-11-10"), hoje)).toEqual({ tipo: "vencido", dias: -2 });
    expect(situacaoDoVencimento(v("b", "2026-11-20"), hoje)).toEqual({ tipo: "prazo", dias: 8 });
    expect(situacaoDoVencimento(v("c", "2026-12-30"), hoje)).toEqual({ tipo: "ok", dias: 48 });
    expect(situacaoDoVencimento(v("d", "2026-11-10", { quitado_em: "2026-11-09" }), hoje)).toEqual({
      tipo: "quitado",
      dias: null,
    });
    expect(situacaoDoVencimento({ vence_em: "2026-11-27" }, hoje).tipo).toBe("prazo"); // aviso padrão 15 dias
    expect(situacaoDoVencimento(v("e", "2026-11-20", { avisar_dias: 5 }), hoje).tipo).toBe("ok");
  });
  it("texto", () => {
    expect(textoDaSituacao({ tipo: "vencido", dias: -1 })).toBe("Venceu ontem");
    expect(textoDaSituacao({ tipo: "vencido", dias: -5 })).toBe("Venceu há 5 dias");
    expect(textoDaSituacao({ tipo: "prazo", dias: 0 })).toBe("Vence hoje");
    expect(textoDaSituacao({ tipo: "prazo", dias: 1 })).toBe("Vence amanhã");
    expect(textoDaSituacao({ tipo: "ok", dias: 40 })).toBe("Vence em 40 dias");
    expect(textoDaSituacao({ tipo: "quitado", dias: null })).toBe("Quitado");
  });
});

it("ordem: vencidos, no prazo, em dia, quitados; por data dentro de cada um", () => {
  const lista = [
    v("ok", "2026-12-30"),
    v("quit", "2026-11-01", { quitado_em: "2026-11-01" }),
    v("prazo2", "2026-11-25"),
    v("venc", "2026-11-05"),
    v("prazo1", "2026-11-14"),
  ];
  expect(ordenarVencimentos(lista, hoje).map((x) => x.id)).toEqual([
    "venc",
    "prazo1",
    "prazo2",
    "ok",
    "quit",
  ]);
  expect(ordenarVencimentos(null, hoje)).toEqual([]);
});

describe("cadastro", () => {
  const base = {
    titulo: " IPVA do ônibus ",
    venceEm: "2027-01-31",
    valor: "1.250,40",
    categoria: "veiculo",
    recorrencia: "anual",
    avisarDias: 30,
    vehicleId: "v1",
    notas: " ",
  };
  it("monta o que vai para o banco", () => {
    expect(vencimentoDoForm(base)).toEqual({
      ok: true,
      dados: {
        titulo: "IPVA do ônibus",
        categoria: "veiculo",
        vehicle_id: "v1",
        vence_em: "2027-01-31",
        valor: 1250.4,
        recorrencia: "anual",
        avisar_dias: 30,
        notas: null,
      },
    });
    expect(
      vencimentoDoForm({ ...base, valor: "", categoria: "xx", recorrencia: "zz", vehicleId: "" })
        .dados,
    ).toMatchObject({ valor: null, categoria: "outro", recorrencia: "nenhuma", vehicle_id: null });
    expect(vencimentoDoForm({ ...base, valor: "80" }).dados.valor).toBe(80);
  });
  it("recusa o que falta", () => {
    expect(vencimentoDoForm({ ...base, titulo: "x" }).ok).toBe(false);
    expect(vencimentoDoForm({ ...base, venceEm: "31/01" }).erro).toBe(
      "Informe a data de vencimento.",
    );
    expect(vencimentoDoForm({ ...base, valor: "-1" }).erro).toBe("Valor inválido.");
    expect(vencimentoDoForm({ ...base, avisarDias: 500 }).ok).toBe(false);
    expect(vencimentoDoForm(null).ok).toBe(false);
  });
  it("listas de opções", () => {
    expect(CATEGORIAS_DE_VENCIMENTO.map((c) => c.id)).toContain("imposto");
    expect(RECORRENCIAS.map((r) => r.id)).toEqual(["nenhuma", "mensal", "anual"]);
  });
});
