import { describe, expect, it } from "vitest";
import {
  haQuantoTempo,
  mensagemDoAprendizado,
  mudancaDaRevisao,
  separarLicoes,
} from "../botAprendizado.js";

const L = (over) => ({
  id: Math.random().toString(36).slice(2),
  kind: "linguagem_cliente",
  status: "ativa",
  needs_review: false,
  evidence_count: 1,
  last_seen_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("separarLicoes", () => {
  it("propostas e lições novas vão para revisar; revisadas, em uso; o resto, descartadas", () => {
    const r = separarLicoes([
      L({ id: "fato", kind: "fato", status: "proposta", needs_review: true }),
      L({ id: "nova", needs_review: true }),
      L({ id: "uso" }),
      L({ id: "rec", status: "recusada" }),
      L({ id: "arq", status: "arquivada" }),
    ]);
    expect(r.paraRevisar.map((l) => l.id).sort()).toEqual(["fato", "nova"]);
    expect(r.emUso.map((l) => l.id)).toEqual(["uso"]);
    expect(r.descartadas.map((l) => l.id).sort()).toEqual(["arq", "rec"]);
  });

  it("as mais vistas vêm primeiro; empate resolve pela mais recente", () => {
    const r = separarLicoes([
      L({ id: "a", evidence_count: 2, last_seen_at: "2026-10-02T00:00:00Z" }),
      L({ id: "b", evidence_count: 9 }),
      L({ id: "c", evidence_count: 2, last_seen_at: "2026-10-05T00:00:00Z" }),
    ]);
    expect(r.emUso.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("lista vazia ou ausente não quebra", () => {
    expect(separarLicoes()).toEqual({ paraRevisar: [], emUso: [], descartadas: [] });
  });
});

describe("mudancaDaRevisao", () => {
  const agora = "2026-10-28T12:00:00Z";
  it("aprovar e confirmar deixam a lição valendo e revisada", () => {
    for (const acao of ["aprovar", "confirmar"]) {
      expect(mudancaDaRevisao({}, acao, { agora, ator: "u1" })).toEqual({
        status: "ativa",
        needs_review: false,
        reviewed_at: agora,
        reviewed_by: "u1",
      });
    }
  });
  it("recusar e arquivar tiram a lição de uso", () => {
    expect(mudancaDaRevisao({}, "recusar", { agora }).status).toBe("recusada");
    expect(mudancaDaRevisao({}, "arquivar", { agora }).status).toBe("arquivada");
  });
  it("restaurar volta para a fila de revisão, nunca direto para valer", () => {
    expect(mudancaDaRevisao({}, "restaurar")).toEqual({
      status: "proposta",
      needs_review: true,
      reviewed_at: null,
      reviewed_by: null,
    });
  });
  it("ação desconhecida é erro", () => {
    expect(() => mudancaDaRevisao({ id: "x" }, "voar")).toThrow(/Ação desconhecida/);
  });
});

describe("haQuantoTempo", () => {
  const agora = new Date("2026-10-28T12:00:00Z");
  it("formata minutos, horas e dias", () => {
    expect(haQuantoTempo("2026-10-28T11:59:40Z", agora)).toBe("agora há pouco");
    expect(haQuantoTempo("2026-10-28T11:30:00Z", agora)).toBe("há 30 min");
    expect(haQuantoTempo("2026-10-28T06:00:00Z", agora)).toBe("há 6 h");
    expect(haQuantoTempo("2026-10-20T12:00:00Z", agora)).toBe("há 8 dias");
  });
  it("sem data (ou a data inicial de 2000) é 'ainda não'", () => {
    expect(haQuantoTempo(null, agora)).toBe("ainda não");
    expect(haQuantoTempo("2000-01-01T00:00:00Z", agora)).toBe("ainda não");
    expect(haQuantoTempo("lixo", agora)).toBe("ainda não");
  });
});

describe("mensagemDoAprendizado", () => {
  it("resume o que foi aprendido", () => {
    expect(mensagemDoAprendizado({ observacoes: 40, novas: 3, reforcos: 2, atualizadas: 1 })).toBe(
      "Li 40 mensagem(ns). 3 lição(ões) nova(s), 2 reforçada(s), 1 atualizada(s).",
    );
    expect(mensagemDoAprendizado({ observacoes: 5, novas: 0, reforcos: 0, atualizadas: 0 })).toBe(
      "Li 5 mensagem(ns). Nada de novo para registrar.",
    );
  });
  it("conta os clientes recorrentes anotados", () => {
    expect(mensagemDoAprendizado({ observacoes: 12, novas: 0, clientes: 2 })).toBe(
      "Li 12 mensagem(ns). 2 cliente(s) anotado(s).",
    );
  });
  it("sem observações, avisa que não há o que aprender", () => {
    expect(mensagemDoAprendizado({ observacoes: 0 })).toContain("Nada novo");
    expect(mensagemDoAprendizado(null)).toContain("Nada novo");
  });
});
