import { describe, expect, it } from "vitest";
import {
  FILTROS_DA_FILA,
  aguardandoDeVerdade,
  contagemDaFila,
  filaDeConversas,
} from "../filaDeAtendimento.js";

// Issue #360: conversa velha marcada como "aguardando" não sobe mais para o topo.
const agora = Date.parse("2026-11-12T20:00:00-03:00");
const h = (horas) => new Date(agora - horas * 3600000).toISOString();

const conversas = [
  {
    conversation_id: "velha",
    status: "open",
    aguardando_equipe: true,
    last_message_at: h(24 * 20),
  },
  { conversation_id: "bot", status: "pending", aguardando_equipe: false, last_message_at: h(1) },
  { conversation_id: "agora", status: "open", aguardando_equipe: true, last_message_at: h(0.1) },
  { conversation_id: "ontem", status: "open", aguardando_equipe: false, last_message_at: h(20) },
  {
    conversation_id: "sem-data",
    status: "pending",
    aguardando_equipe: false,
    last_message_at: null,
  },
];
const ids = (l) => l.map((c) => c.conversation_id);

describe("fila de atendimento (issue #360)", () => {
  it("todas: a mais recente primeiro, a velha aguardando fica no fim", () => {
    expect(ids(filaDeConversas(conversas, "todas", agora))).toEqual([
      "agora",
      "bot",
      "ontem",
      "velha",
      "sem-data",
    ]);
  });

  it("aguardando só vale nas últimas 48 h", () => {
    expect(aguardandoDeVerdade(conversas[2], agora)).toBe(true);
    expect(aguardandoDeVerdade(conversas[0], agora)).toBe(false);
    expect(aguardandoDeVerdade({ aguardando_equipe: true, last_message_at: h(47) }, agora)).toBe(
      true,
    );
    expect(aguardandoDeVerdade({ aguardando_equipe: true, last_message_at: h(49) }, agora)).toBe(
      false,
    );
    expect(aguardandoDeVerdade({ aguardando_equipe: false, last_message_at: h(1) }, agora)).toBe(
      false,
    );
    expect(aguardandoDeVerdade(null, agora)).toBe(false);
    expect(ids(filaDeConversas(conversas, "aguardando", agora))).toEqual(["agora"]);
  });

  it("com a equipe e com o bot", () => {
    expect(ids(filaDeConversas(conversas, "equipe", agora))).toEqual(["agora", "ontem", "velha"]);
    expect(ids(filaDeConversas(conversas, "bot", agora))).toEqual(["bot", "sem-data"]);
  });

  it("contagem por filtro e lista vazia", () => {
    expect(contagemDaFila(conversas, agora)).toEqual({
      todas: 5,
      aguardando: 1,
      equipe: 3,
      bot: 2,
    });
    expect(contagemDaFila(null, agora)).toEqual({ todas: 0, aguardando: 0, equipe: 0, bot: 0 });
    expect(filaDeConversas(undefined)).toEqual([]);
    expect(FILTROS_DA_FILA.map((f) => f.id)).toEqual(["todas", "aguardando", "equipe", "bot"]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...conversas];
    filaDeConversas(conversas, "todas", agora);
    expect(conversas).toEqual(copia);
  });
});
