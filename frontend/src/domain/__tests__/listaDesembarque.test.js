import { describe, expect, it } from "vitest";
import {
  MAX_TEXTO,
  linhasVisiveis,
  mesclarListas,
  mudarLinha,
  novaLinha,
  resumoDaLista,
  temPendente,
} from "../listaDesembarque.js";

// Lista de desembarque anotada na viagem (issue #383) — a mesma regra de juntar
// de rpc_salvar_lista_desembarque (database/106).
const T0 = Date.parse("2030-01-01T15:00:00.000Z");
const min = (n) => T0 + n * 60000;

describe("linhas", () => {
  it("nova linha limpa espaços, corta no máximo e recusa texto vazio", () => {
    expect(novaLinha("  2P   Cohatrac ", { id: "a", agora: T0 })).toEqual({
      id: "a",
      texto: "2P Cohatrac",
      feito: false,
      apagada: false,
      criada: "2030-01-01T15:00:00.000Z",
      em: "2030-01-01T15:00:00.000Z",
    });
    expect(novaLinha("   ", { id: "b", agora: T0 })).toBeNull();
    expect(novaLinha("x".repeat(500), { id: "c", agora: T0 }).texto).toHaveLength(MAX_TEXTO);
  });
  it("mudar marca feito, edita o texto e apagar o texto apaga a linha", () => {
    const l = [
      novaLinha("Rodoviária", { id: "a", agora: T0 }),
      novaLinha("Turu", { id: "b", agora: T0 }),
    ];
    const feito = mudarLinha(l, "a", { feito: true }, min(5));
    expect(feito[0]).toMatchObject({ feito: true, em: "2030-01-01T15:05:00.000Z" });
    expect(feito[1]).toBe(l[1]); // a outra não muda
    const editado = mudarLinha(l, "b", { texto: "  Turu,   perto da praça " }, min(6));
    expect(editado[1].texto).toBe("Turu, perto da praça");
    expect(mudarLinha(l, "b", { texto: " " }, min(7))[1].apagada).toBe(true);
    expect(mudarLinha(null, "x", {}, T0)).toEqual([]);
  });
});

describe("juntar duas versões", () => {
  const a1 = novaLinha("2P Cohatrac", { id: "l1", agora: T0 });
  const a2 = novaLinha("Rodoviária", { id: "l2", agora: min(1) });
  const b3 = novaLinha("1P Turu", { id: "l3", agora: min(2) });

  it("a mudança mais nova de cada linha vence; ordem de criação", () => {
    const aparelho1 = [a1, a2];
    const aparelho2 = mudarLinha(
      mudarLinha([a1, a2, b3], "l1", { feito: true }, min(5)),
      "l2",
      { apagada: true },
      min(6),
    );
    const junta = mesclarListas(aparelho1, aparelho2);
    expect(junta.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    expect(junta[0].feito).toBe(true);
    expect(junta[1].apagada).toBe(true);
    // reenviar a versão antiga não desfaz o que o outro aparelho marcou
    expect(mesclarListas(junta, [a1])[0].feito).toBe(true);
    expect(mesclarListas([a1], junta)[0].feito).toBe(true);
  });
  it("ignora linha torta e lista vazia", () => {
    expect(mesclarListas(null, [{ id: "x" }, a1, null])).toEqual([a1]);
    expect(mesclarListas([], [])).toEqual([]);
  });
  it("visíveis, resumo e o que falta enviar", () => {
    const l = mudarLinha(
      mudarLinha([a1, a2, b3], "l1", { feito: true }, min(5)),
      "l2",
      { apagada: true },
      min(6),
    );
    expect(linhasVisiveis(l).map((x) => x.id)).toEqual(["l1", "l3"]);
    expect(resumoDaLista(l)).toEqual({ total: 2, feitas: 1 });
    expect(temPendente(l, [a1, a2, b3])).toBe(true); // l1 e l2 mudaram depois
    expect(temPendente([a1], [a1])).toBe(false);
    expect(temPendente([a1], [])).toBe(true);
    expect(temPendente([a1], l)).toBe(false); // o banco já tem versão mais nova
  });
});
