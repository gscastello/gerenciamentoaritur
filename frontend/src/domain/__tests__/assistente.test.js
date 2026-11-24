import { describe, expect, it } from "vitest";
import {
  pedidoDaPendencia,
  pendenciaProntaParaFechar,
  propostaParaAVoz,
  relogio,
  respostaDaFala,
  textoParaFalar,
} from "../assistente.js";

describe("assistente na tela (#516)", () => {
  it("o pedido da pendência mostra o assunto e leva o detalhe e o id para o modelo", () => {
    const p = pedidoDaPendencia({
      id: "p1",
      assunto: "Agendado não lançou",
      cliente: "Maria",
      phone: "98999998888",
      detail: "o cliente escreveu 2 e ficou 3",
      source: "whatsapp",
    });
    expect(p.texto).toBe("Resolva a pendência: Agendado não lançou (Maria · 98999998888)");
    expect(p.contexto).toContain("pendência id p1");
    expect(p.contexto).toContain("o cliente escreveu 2");
    expect(p.contexto).toContain("Telefone do cliente: 98999998888");
    expect(p.pendencia).toEqual({ id: "p1", assunto: "Agendado não lançou" });
    const vazio = pedidoDaPendencia({ id: "p2" });
    expect(vazio.texto).toBe("Resolva a pendência: sem assunto");
    expect(vazio.contexto).toContain("origem manual");
    expect(vazio.contexto).not.toContain("Telefone");
  });

  it("só fala exata confirma ou descarta", () => {
    expect(respostaDaFala("Sim.")).toBe("sim");
    expect(respostaDaFala("Pode confirmar!")).toBe("sim");
    expect(respostaDaFala("Não")).toBe("nao");
    expect(respostaDaFala("deixa pra lá")).toBe("nao");
    expect(respostaDaFala("sim, mas na sexta")).toBeNull();
    expect(respostaDaFala("cancela a reserva da Maria")).toBeNull();
    expect(respostaDaFala("")).toBeNull();
  });

  it("a voz só confirma quando há uma proposta aberta na última resposta", () => {
    const a = { id: "1", estado: "proposta" };
    expect(propostaParaAVoz([{ papel: "assistente", acoes: [a] }])).toBe(a);
    expect(
      propostaParaAVoz([{ papel: "assistente", acoes: [a, { id: "2", estado: "proposta" }] }]),
    ).toBeNull();
    expect(
      propostaParaAVoz([
        { papel: "assistente", acoes: [a] },
        { papel: "assistente", texto: "ok" },
      ]),
    ).toBeNull();
    expect(propostaParaAVoz([])).toBeNull();
    expect(propostaParaAVoz(undefined)).toBeNull();
  });

  it("a pendência pode ser fechada depois de gravar o que resolve", () => {
    const pedido = { papel: "usuario", pendencia: { id: "p1", assunto: "x" } };
    const com = (...acoes) => [pedido, { papel: "assistente", acoes }];
    expect(pendenciaProntaParaFechar(com({ tipo: "criar", estado: "feita" }))).toEqual({
      id: "p1",
      assunto: "x",
    });
    expect(pendenciaProntaParaFechar(com({ tipo: "criar", estado: "proposta" }))).toBeNull();
    expect(pendenciaProntaParaFechar(com({ tipo: "ensinar", estado: "feita" }))).toBeNull();
    expect(
      pendenciaProntaParaFechar(
        com({ tipo: "criar", estado: "feita" }, { tipo: "resolver_pendencia", estado: "feita" }),
      ),
    ).toBeNull();
    expect(
      pendenciaProntaParaFechar(
        com({ tipo: "criar", estado: "feita" }, { tipo: "resolver_pendencia", estado: "proposta" }),
      ),
    ).toBeNull();
    expect(pendenciaProntaParaFechar([{ papel: "usuario" }])).toBeNull();
    expect(pendenciaProntaParaFechar(undefined)).toBeNull();
  });

  it("lê em voz alta sem telefone nem marcação e pergunta quando há proposta", () => {
    expect(textoParaFalar("**Preparei** a reserva de Maria (98 98888-7777). R$ 60,00.")).toBe(
      "Preparei a reserva de Maria. 60 reais.",
    );
    expect(textoParaFalar("Preparei.", [{ estado: "proposta" }])).toBe("Preparei. Confirma?");
    expect(textoParaFalar("Duas.", [{}, {}])).toBe("Duas. Confira os cartões na tela.");
    expect(textoParaFalar("Feito.", [{ estado: "feita" }])).toBe("Feito.");
    expect(textoParaFalar("a".repeat(500))).toHaveLength(320);
    expect(textoParaFalar(`Curta. ${"b".repeat(400)}.`)).toBe("Curta.");
    expect(textoParaFalar(null)).toBe("");
  });

  it("relógio da gravação", () => {
    expect(relogio(0)).toBe("0:00");
    expect(relogio(7900)).toBe("0:07");
    expect(relogio(61_000)).toBe("1:01");
    expect(relogio(-5)).toBe("0:00");
  });
});
