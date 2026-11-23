import { describe, expect, it } from "vitest";
import { diasAConfirmar, sentidosDoDia, viagensDeHojeEAmanha } from "../veiculoDoDia.js";

const HOJE = "2026-11-23";
const AMANHA = "2026-11-24";
const v = (trip_date, direction, extra = {}) => ({
  trip_date,
  direction,
  status: "agendada",
  vehicle_confirmed_at: null,
  ...extra,
});
const em = (hora) => ({ hoje: HOJE, amanha: AMANHA, hora });

describe("veículo do dia (issue #502)", () => {
  const todas = [v(HOJE, "ida"), v(HOJE, "volta"), v(AMANHA, "ida"), v(AMANHA, "volta")];

  it("pergunta o de amanhã a partir das 14h", () => {
    expect(diasAConfirmar(todas, em("13:59")).map((d) => d.quando)).toEqual([]);
    const [d] = diasAConfirmar(todas, em("14:00"));
    expect(d).toMatchObject({ data: AMANHA, quando: "amanhã" });
    expect(d.viagens).toHaveLength(2);
  });

  it("cobra o de hoje enquanto a viagem não saiu", () => {
    expect(diasAConfirmar(todas, em("05:59"))[0].viagens.map((t) => t.direction)).toEqual([
      "ida",
      "volta",
    ]);
    expect(diasAConfirmar(todas, em("06:00"))[0].viagens.map((t) => t.direction)).toEqual([
      "volta",
    ]);
    expect(diasAConfirmar(todas, em("13:00"))).toEqual([]);
  });

  it("não cobra viagem confirmada, que já saiu, nem linha sem o campo", () => {
    const lista = [
      v(AMANHA, "ida", { vehicle_confirmed_at: "2026-11-23T18:00:00Z" }),
      v(AMANHA, "volta", { status: "finalizada" }),
      v(AMANHA, "volta", { vehicle_confirmed_at: undefined }),
    ];
    expect(diasAConfirmar(lista, em("20:00"))).toEqual([]);
    expect(diasAConfirmar(null, em("20:00"))).toEqual([]);
  });

  it("diz os sentidos do dia", () => {
    expect(sentidosDoDia([v(HOJE, "ida"), v(HOJE, "volta")])).toBe("Ida e Volta");
    expect(sentidosDoDia([v(HOJE, "volta")])).toBe("Volta");
  });

  it("lista hoje e amanhã em ordem", () => {
    const l = viagensDeHojeEAmanha(
      [v(AMANHA, "volta"), v("2026-11-30", "ida"), v(HOJE, "volta"), v(AMANHA, "ida")],
      { hoje: HOJE, amanha: AMANHA },
    );
    expect(l.map((t) => `${t.trip_date} ${t.direction}`)).toEqual([
      `${HOJE} volta`,
      `${AMANHA} ida`,
      `${AMANHA} volta`,
    ]);
    expect(viagensDeHojeEAmanha(undefined, { hoje: HOJE, amanha: AMANHA })).toEqual([]);
  });
});
