import { describe, expect, it } from "vitest";
import { agendadosSemReserva, ehPendenciaDoAgendado, motivoCurto } from "../agendadoSemReserva.js";

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
});
