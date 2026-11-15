import { describe, expect, it } from "vitest";
import {
  TEXTO_PADRAO,
  fraseDoEmbarque,
  horarioDoPonto,
  montarAvisos,
  nomeDoAviso,
  quandoDoAviso,
  textoDoAviso,
} from "../avisoAosPassageiros.js";

const pontos = [
  { id: "busca", nome: "Buscar em Casa", horaBase: "05:00" },
  { id: "rodoviaria", nome: "Rodoviária", horaBase: "05:40" },
  { id: "retorno", nome: "Retorno das Vans", horaBase: "06:00" },
  { id: "outro", nome: "Outros", horaBase: "06:30" },
];
const SEGUNDA = "2026-11-16";
const r = (id, campos) => ({
  id,
  data: SEGUNDA,
  direcao: "ida",
  tipo: "passagem",
  status: "confirmada",
  telefone: `9899999${id.padStart(4, "0")}`,
  nome: `Maria ${id}`,
  ...campos,
});

describe("nomeDoAviso", () => {
  it("primeiro nome; tratamento vai junto; sem nome ou 'Passageiro (…)' = null", () => {
    expect(nomeDoAviso("maria da silva")).toBe("Maria");
    expect(nomeDoAviso("Dona maria das Graças")).toBe("Dona Maria");
    expect(nomeDoAviso("Sr. antônio")).toBe("Sr. Antônio");
    expect(nomeDoAviso("Dona")).toBeNull();
    expect(nomeDoAviso("Dona 3")).toBeNull();
    expect(nomeDoAviso("Passageiro (lá Belle Maiobão)")).toBeNull();
    expect(nomeDoAviso("98999990000")).toBeNull();
    expect(nomeDoAviso("")).toBeNull();
    expect(nomeDoAviso(null)).toBeNull();
  });
});

describe("horarioDoPonto e quandoDoAviso", () => {
  it("na segunda a Ida sai mais cedo; a Volta e os outros dias não mudam", () => {
    expect(horarioDoPonto("05:40", SEGUNDA, "ida")).toBe("04:40");
    expect(horarioDoPonto("05:40", SEGUNDA, "ida", { segundaHoras: 2 })).toBe("03:40");
    expect(horarioDoPonto("05:40", SEGUNDA, "ida", { segundaAtiva: false })).toBe("05:40");
    expect(horarioDoPonto("05:40:00", "2026-11-17", "ida")).toBe("05:40");
    expect(horarioDoPonto("12:00", SEGUNDA, "volta")).toBe("12:00");
    expect(horarioDoPonto(null, SEGUNDA, "ida")).toBeNull();
  });
  it("hoje, amanhã ou o dia da semana", () => {
    expect(quandoDoAviso(SEGUNDA, "2026-11-15")).toBe("de amanhã, segunda (16/11)");
    expect(quandoDoAviso(SEGUNDA, SEGUNDA)).toBe("de hoje, segunda (16/11)");
    expect(quandoDoAviso("2026-11-18", "2026-11-15")).toBe("de quarta (18/11)");
  });
});

describe("fraseDoEmbarque e textoDoAviso", () => {
  it("frase pelo ponto: busca e BR 'a partir das', ponto fixo 'às', Volta pela cidade", () => {
    expect(fraseDoEmbarque({ direcao: "ida", pontoId: "busca" }, "Buscar em Casa", "04:00")).toBe(
      "vamos te buscar em casa a partir das 04:00 — fique de olho no celular.",
    );
    expect(fraseDoEmbarque({ direcao: "ida", pontoId: "rodoviaria" }, "Rodoviária", "04:40")).toBe(
      "seu embarque é na Rodoviária às 04:40.",
    );
    expect(
      fraseDoEmbarque({ direcao: "ida", pontoId: "retorno" }, "Retorno das Vans", "05:00"),
    ).toBe("seu embarque é no Retorno das Vans às 05:00.");
    expect(fraseDoEmbarque({ direcao: "ida", pontoId: "carone" }, "Posto Carone", "05:40")).toBe(
      "seu embarque é em Posto Carone às 05:40.",
    );
    expect(
      fraseDoEmbarque(
        { direcao: "ida", pontoId: "outro", embarque: "Estiva (BR)" },
        "Outros",
        "05:30",
      ),
    ).toBe("seu embarque é em Estiva a partir das 05:30.");
    expect(fraseDoEmbarque({ direcao: "ida", pontoId: "outro" }, "Outros", "05:30")).toBe(
      "seu embarque é na BR a partir das 05:30.",
    );
    expect(fraseDoEmbarque({ direcao: "volta", pontoId: "pirapemas" }, "Pirapemas", "12:00")).toBe(
      "a Volta sai de Pirapemas a partir das 12:00.",
    );
    expect(fraseDoEmbarque({ direcao: "ida", pontoId: "busca" }, "Buscar em Casa", null)).toBe("");
  });
  it("monta o texto; sem nome fica só 'Olá!'", () => {
    const t = textoDoAviso(TEXTO_PADRAO, {
      nome: "Maria",
      quando: "de amanhã, segunda (16/11)",
      avisoDoDia: "como é segunda, a Ida sai 1 hora mais cedo.",
      embarque: "seu embarque é na Rodoviária às 04:40.",
    });
    expect(t).toBe(
      "Olá, Maria! Lembrete da sua viagem de amanhã, segunda (16/11), com a AriTur: como é segunda, a Ida sai 1 hora mais cedo. Seu embarque é na Rodoviária às 04:40. Qualquer dúvida, é só responder aqui. 😊",
    );
    expect(textoDoAviso("{saudacao} {embarque}", { nome: null, embarque: "" })).toBe("Olá!");
    expect(textoDoAviso(null, {})).toBe("");
  });
});

describe("montarAvisos", () => {
  it("um por telefone, só passagens confirmadas/pendentes com telefone, na ordem dos pontos", () => {
    const reservas = [
      r("1", { pontoId: "retorno" }),
      r("2", { pontoId: "busca", nome: "Dona maria" }),
      r("3", { pontoId: "busca", telefone: "98999990002" }), // mesmo telefone da 2
      r("4", { pontoId: "rodoviaria", status: "cancelada" }),
      r("5", { pontoId: "rodoviaria", tipo: "encomenda" }),
      r("6", { pontoId: "rodoviaria", telefone: "123" }),
      r("7", { pontoId: "rodoviaria", direcao: "volta" }),
      r("8", { pontoId: "outro", embarque: "Estiva (BR)", status: "pendente" }),
      r("9", { pontoId: "rodoviaria", data: "2026-11-17" }),
    ];
    const lista = montarAvisos({
      reservas,
      data: SEGUNDA,
      direcao: "ida",
      hoje: "2026-11-15",
      pontos,
    });
    expect(lista.map((a) => a.id)).toEqual(["2", "1", "8"]);
    expect(lista[0].horario).toBe("04:00");
    expect(lista[0].texto).toContain("Olá, Dona Maria!");
    expect(lista[0].texto).toContain("como é segunda, a Ida sai 1 hora mais cedo.");
    expect(lista[1].texto).toContain("Seu embarque é no Retorno das Vans às 05:00.");
    expect(lista[2].texto).toContain("em Estiva a partir das 05:30");
    expect(lista[2].variaveis).toEqual({
      nome: "Maria",
      dia: "segunda, 16/11",
      ponto: "Outros",
      horario: "05:30",
    });
    expect(lista.every((a) => a.marcado)).toBe(true);
  });
  it("quem já recebeu vem desmarcado; o último aviso de cada reserva vale", () => {
    const reservas = [r("1", { pontoId: "retorno" }), r("2", { pontoId: "busca" })];
    const avisos = [
      { reservation_id: "1", status: "fora_da_janela", criado_em: "2026-11-15T20:00:00Z" },
      { reservation_id: "1", status: "enviado", criado_em: "2026-11-15T21:00:00Z" },
      { reservation_id: "2", status: "enviado", criado_em: "2026-11-15T20:00:00Z" },
      { reservation_id: "2", status: "falhou", criado_em: "2026-11-15T21:00:00Z" },
    ];
    const lista = montarAvisos({
      reservas,
      data: SEGUNDA,
      direcao: "ida",
      hoje: "2026-11-15",
      pontos,
      avisos,
    });
    const porId = Object.fromEntries(lista.map((a) => [a.id, a]));
    expect(porId["1"].marcado).toBe(false);
    expect(porId["1"].anterior.status).toBe("enviado");
    expect(porId["2"].marcado).toBe(true);
    expect(porId["2"].anterior.status).toBe("falhou");
  });
  it("Volta e dia comum: sem aviso de segunda; 2 horas no plural", () => {
    const volta = montarAvisos({
      reservas: [r("1", { direcao: "volta", pontoId: "pirapemas" })],
      data: SEGUNDA,
      direcao: "volta",
      hoje: "2026-11-15",
      pontos: [{ id: "pirapemas", nome: "Pirapemas", horaBase: "12:00" }],
    });
    expect(volta[0].texto).toContain("A Volta sai de Pirapemas a partir das 12:00.");
    expect(volta[0].texto).not.toContain("mais cedo");
    const duas = montarAvisos({
      reservas: [r("1", { pontoId: "retorno" })],
      data: SEGUNDA,
      direcao: "ida",
      hoje: "2026-11-15",
      pontos,
      segundaHoras: 2,
    });
    expect(duas[0].texto).toContain("sai 2 horas mais cedo");
    expect(duas[0].horario).toBe("04:00");
    expect(
      montarAvisos({ reservas: null, data: SEGUNDA, direcao: "ida", hoje: SEGUNDA, pontos: null }),
    ).toEqual([]);
  });
});
