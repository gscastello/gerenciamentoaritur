import { describe, expect, it } from "vitest";
import {
  agendadosSemReserva,
  ehPendenciaDoAgendado,
  motivoCurto,
  tituloDaFaixa,
} from "../agendadoSemReserva.js";

// Issue #455: o "Agendado ☑️" que não lançou vai para a faixa fixa do topo (dados fictícios).
const rodape = " Confira a conversa e lance pela Agenda (ou por Atendimento → Reservas prontas).";

describe("Agendado sem reserva", () => {
  it("só as pendências do Agendado, abertas, a mais antiga primeiro", () => {
    const lista = agendadosSemReserva([
      {
        id: "b",
        assunto: "Agendado ☑️ não lançou",
        detail: `Motivo: o dia da viagem não aparece na conversa.${rodape}`,
        cliente: "Maria Teste",
        phone: "5598900001111",
        created_at: "2026-11-17T13:00:00Z",
      },
      {
        id: "x",
        assunto: "Falar com atendente",
        detail: "quer falar",
        created_at: "2026-11-17T10:00:00Z",
      },
      {
        id: "a",
        subject: "Agendado ☑️ lançou só parte",
        detail: `1 reserva(s) lançada(s), mas ficou pendente: o cliente pediu também outro dia (confira e lance pela Agenda).${rodape}`,
        cliente: "",
        phone: "5598900002222",
        created_at: "2026-11-16T21:00:00Z",
      },
      {
        id: "r",
        assunto: "Agendado ☑️ não lançou",
        status: "resolvida",
        created_at: "2026-11-15T10:00:00Z",
      },
    ]);
    expect(lista.map((p) => p.id)).toEqual(["a", "b"]);
    expect(lista[0]).toMatchObject({ quem: "98 90000-2222", parte: true });
    expect(lista[0].motivo).toBe(
      "1 reserva(s) lançada(s), mas ficou pendente: o cliente pediu também outro dia",
    );
    expect(lista[1]).toMatchObject({
      quem: "Maria Teste",
      parte: false,
      motivo: "O dia da viagem não aparece na conversa",
    });
  });

  it("sem nome nem telefone, e lista vazia", () => {
    expect(agendadosSemReserva([{ id: "s", assunto: "Agendado ☑️ não lançou" }])[0]).toMatchObject({
      quem: "Passageiro sem nome",
      motivo: "O bot não conseguiu ler o pedido",
      em: null,
    });
    expect(
      agendadosSemReserva([{ id: "f", assunto: "Agendado ☑️ não lançou", phone: "98123" }])[0].quem,
    ).toBe("98123");
    expect(agendadosSemReserva(null)).toEqual([]);
  });

  it("reconhece o assunto e limpa o motivo", () => {
    expect(ehPendenciaDoAgendado({ assunto: "Agendado ☑️ não lançou" })).toBe(true);
    expect(ehPendenciaDoAgendado({ subject: "Comprovante" })).toBe(false);
    expect(ehPendenciaDoAgendado(null)).toBe(false);
    expect(motivoCurto(`Motivo: a cidade da Volta não foi dita.${rodape}`)).toBe(
      "A cidade da Volta não foi dita",
    );
    expect(motivoCurto("")).toBe("O bot não conseguiu ler o pedido");
  });

  it("#461/#462: pedido sem reserva da sentinela e IA fora do ar entram na faixa", () => {
    const lista = agendadosSemReserva([
      {
        id: "p",
        assunto: "Pedido sem reserva",
        detail: `O cliente pediu Ida de amanhã (19/11) e ainda não está na Agenda.${rodape}`,
        cliente: "Ana Teste",
        created_at: "2026-11-18T12:00:00Z",
      },
      {
        id: "ia",
        assunto: "IA fora do ar",
        detail: "A IA recusou a leitura.",
        created_at: "2026-11-18T11:00:00Z",
      },
    ]);
    expect(lista.map((p) => [p.id, p.tipo, p.quem])).toEqual([
      ["ia", "ia", "Bot"],
      ["p", "pedido", "Ana Teste"],
    ]);
    expect(lista[1].motivo).toBe(
      "O cliente pediu Ida de amanhã (19/11) e ainda não está na Agenda",
    );
    expect(tituloDaFaixa(lista)).toBe("1 passageiro pediu e ainda não tem lugar na Agenda");
    expect(tituloDaFaixa([lista[0]])).toMatch(/IA do bot está fora do ar/);
    expect(tituloDaFaixa([{ tipo: "agendado" }, { tipo: "agendado" }])).toBe(
      "2 passageiros marcados como Agendado ☑️ ainda não têm lugar na Agenda",
    );
    expect(tituloDaFaixa([{ tipo: "pedido" }, { tipo: "agendado" }])).toBe(
      "2 passageiros pediram e ainda não têm lugar na Agenda",
    );
    expect(tituloDaFaixa(null)).toMatch(/IA do bot/);
  });
});

// Issue #476: o revisor achou o dia (ou o sentido) errado numa viagem próxima — vai para a faixa.
describe("Revisão: dia ou sentido errado na faixa", () => {
  const revisao = {
    id: "t-rev",
    subject: "Revisão: dia ou sentido errado",
    status: "aberta",
    phone: "98999990000",
    cliente: "Maria Teste",
    created_at: "2026-11-19T17:43:00Z",
    detail:
      'data: está "2026-11-23", parece "2026-11-22" (alta) — "quero ir domingo". O domingo é 22/11.\nObservação do revisor: confira.',
  };

  it("entra na faixa com o dia da Agenda e o pedido", async () => {
    const { motivoDaRevisao } = await import("../agendadoSemReserva.js");
    expect(ehPendenciaDoAgendado(revisao)).toBe(true);
    // a revisão comum continua só na fila
    expect(ehPendenciaDoAgendado({ subject: "Revisão: conferir reserva" })).toBe(false);
    const [item] = agendadosSemReserva([revisao]);
    expect(item).toEqual({
      id: "t-rev",
      tipo: "revisao",
      quem: "Maria Teste",
      motivo: "Dia na Agenda 23/11, pedido 22/11",
      parte: false,
      em: "2026-11-19T17:43:00Z",
    });
    expect(
      motivoDaRevisao('sentido: está "ida", parece "volta" (alta) — "indo pra São Luís"'),
    ).toBe("Sentido na Agenda ida, pedido volta");
    // fora do formato: a primeira linha do detalhe
    expect(motivoDaRevisao("embarque errado\nmais coisa")).toBe("Embarque errado");
    expect(motivoDaRevisao(null)).toBe("O bot não conseguiu ler o pedido");
  });

  it("título: só revisões, ou misturadas com os outros avisos", () => {
    expect(tituloDaFaixa([{ tipo: "revisao" }])).toBe("1 reserva está no dia ou no sentido errado");
    expect(tituloDaFaixa([{ tipo: "revisao" }, { tipo: "revisao" }])).toBe(
      "2 reservas estão no dia ou no sentido errado",
    );
    expect(tituloDaFaixa([{ tipo: "revisao" }, { tipo: "agendado" }])).toBe(
      "2 passageiros pediram e ainda não têm lugar na Agenda",
    );
    expect(tituloDaFaixa([{ tipo: "revisao" }, { tipo: "ia" }])).toBe(
      "1 reserva está no dia ou no sentido errado",
    );
  });
});
