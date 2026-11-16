import { describe, expect, it } from "vitest";
import {
  MAX_TEXTO,
  linhasVisiveis,
  mesclarListas,
  mudarLinha,
  novaLinha,
  posicaoDaLinha,
  reordenarLinhas,
  resumoDaLista,
  temPendente,
  textoDaListaAnotada,
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

describe("organizar a lista anotada (issue #440)", () => {
  const T = Date.parse("2026-11-16T10:00:00Z");
  const linha = (id, seg, extra = {}) => ({
    id,
    texto: id,
    feito: false,
    apagada: false,
    criada: new Date(T + seg * 1000).toISOString(),
    em: new Date(T + seg * 1000).toISOString(),
    ...extra,
  });
  const AGORA = T + 3600_000;
  const ids = (l) => linhasVisiveis(l).map((x) => x.id);
  const mudadas = (antes, depois) =>
    depois.filter((d) => antes.find((a) => a.id === d.id)?.em !== d.em).map((d) => d.id);

  it("posição: a ordem dada ou a hora em que foi anotada", () => {
    expect(posicaoDaLinha(linha("a", 0))).toBe(T);
    expect(posicaoDaLinha(linha("a", 0, { ordem: 5 }))).toBe(5);
    expect(posicaoDaLinha(linha("a", 0, { ordem: null }))).toBe(T);
    expect(posicaoDaLinha(linha("a", 0, { ordem: Number.NaN }))).toBe(T);
    expect(posicaoDaLinha({ id: "x" })).toBe(0);
  });

  it("mover a última para o topo muda só ela", () => {
    const lista = [linha("a", 0), linha("b", 10), linha("c", 20)];
    const nova = reordenarLinhas(lista, ["c", "a", "b"], AGORA);
    expect(ids(nova)).toEqual(["c", "a", "b"]);
    expect(mudadas(lista, nova)).toEqual(["c"]);
    expect(nova.find((l) => l.id === "c").em).toBe(new Date(AGORA).toISOString());
    expect(nova.find((l) => l.id === "c").ordem).toBe(T - 1000);
  });

  it("mover a primeira para o fim e uma para o meio", () => {
    const lista = [linha("a", 0), linha("b", 10), linha("c", 20), linha("d", 30)];
    const fim = reordenarLinhas(lista, ["b", "c", "d", "a"], AGORA);
    expect(ids(fim)).toEqual(["b", "c", "d", "a"]);
    expect(mudadas(lista, fim)).toEqual(["a"]);
    expect(fim.find((l) => l.id === "a").ordem).toBe(T + 31_000);
    const meio = reordenarLinhas(lista, ["a", "d", "b", "c"], AGORA);
    expect(ids(meio)).toEqual(["a", "d", "b", "c"]);
    expect(mudadas(lista, meio)).toEqual(["d"]);
    expect(meio.find((l) => l.id === "d").ordem).toBe(T + 5000);
  });

  it("duas seguidas fora do lugar ficam espaçadas entre as vizinhas", () => {
    const lista = [linha("a", 0), linha("b", 10), linha("c", 20), linha("d", 30), linha("e", 40)];
    const nova = reordenarLinhas(lista, ["a", "d", "e", "b", "c"], AGORA);
    expect(ids(nova)).toEqual(["a", "d", "e", "b", "c"]);
    expect(mudadas(lista, nova).sort()).toEqual(["b", "c"]);
    expect(nova.find((l) => l.id === "b").ordem).toBe(T + 41_000);
    expect(nova.find((l) => l.id === "c").ordem).toBe(T + 42_000);
    const topo = reordenarLinhas(lista, ["d", "e", "a", "b", "c"], AGORA);
    expect(ids(topo)).toEqual(["d", "e", "a", "b", "c"]);
    expect(mudadas(lista, topo).sort()).toEqual(["d", "e"]);
    expect(topo.find((l) => l.id === "d").ordem).toBe(T - 2000);
    expect(topo.find((l) => l.id === "e").ordem).toBe(T - 1000);
    const entre = reordenarLinhas(lista, ["a", "d", "e", "b", "c"].reverse(), AGORA);
    expect(ids(entre)).toEqual(["c", "b", "e", "d", "a"]);
  });

  it("mesma ordem não muda nada; a apagada fica de fora e não é tocada", () => {
    const lista = [linha("a", 0), linha("x", 5, { apagada: true }), linha("b", 10)];
    expect(reordenarLinhas(lista, ["a", "b"], AGORA)).toEqual(lista);
    const nova = reordenarLinhas(lista, ["b", "a"], AGORA);
    expect(ids(nova)).toEqual(["b", "a"]);
    expect(nova.find((l) => l.id === "x")).toEqual(lista[1]);
    expect(reordenarLinhas(undefined, ["a"], AGORA)).toEqual([]);
    expect(reordenarLinhas(lista, undefined, AGORA)).toEqual(lista);
  });

  it("sem espaço entre as vizinhas, renumera; posições iguais ficam em sequência", () => {
    const e = Number.EPSILON;
    const lista = [
      linha("a", 0, { ordem: 1 }),
      linha("b", 1, { ordem: 1 + e }),
      linha("d", 2, { ordem: 1 + 2 * e }),
      linha("c", 3, { ordem: 9 }),
    ];
    const nova = reordenarLinhas(lista, ["a", "c", "b", "d"], AGORA);
    expect(ids(nova)).toEqual(["a", "c", "b", "d"]);
    expect(nova.map((l) => l.ordem)).toEqual([1000, 2000, 3000, 4000]);
    const iguais = reordenarLinhas(
      [linha("a", 0, { ordem: 1 }), linha("b", 0, { ordem: 1 }), linha("c", 0, { ordem: 1 })],
      ["c", "b", "a"],
      AGORA,
    );
    expect(ids(iguais)).toEqual(["c", "b", "a"]);
    expect(iguais.map((l) => l.ordem)).toEqual([1, 1001, 2001]);
  });

  it("juntar: a ordem dada vale nos dois aparelhos", () => {
    const lista = [linha("a", 0), linha("b", 10), linha("c", 20)];
    const aqui = reordenarLinhas(lista, ["c", "a", "b"], AGORA);
    // o outro aparelho marcou "b" como desceu ao mesmo tempo
    const la = mudarLinha(lista, "b", { feito: true }, AGORA + 1);
    const junta = mesclarListas(aqui, la);
    expect(ids(junta)).toEqual(["c", "a", "b"]);
    expect(junta.find((l) => l.id === "b").feito).toBe(true);
  });
});

describe("copiar o que foi anotado (issue #440)", () => {
  it("cabeçalho com sentido e dia; linhas numeradas na ordem; ✓ em quem desceu; sem as apagadas", () => {
    const lista = [
      { id: "a", texto: "2P — Cohatrac", feito: true, apagada: false, criada: "1", em: "1" },
      { id: "x", texto: "apagada", feito: false, apagada: true, criada: "2", em: "2" },
      { id: "b", texto: "Rodoviária", feito: false, apagada: false, criada: "3", em: "3" },
    ];
    expect(textoDaListaAnotada(lista, { data: "2026-11-16", direcao: "ida" })).toBe(
      "Desembarque · Ida · segunda, 16/11\n1. 2P — Cohatrac ✓\n2. Rodoviária",
    );
    expect(textoDaListaAnotada([], { data: "2026-11-15", direcao: "volta" })).toBe(
      "Desembarque · Volta · domingo, 15/11",
    );
    expect(textoDaListaAnotada(undefined, { data: null, direcao: "ida" })).toBe(
      "Desembarque · Ida",
    );
  });
});
