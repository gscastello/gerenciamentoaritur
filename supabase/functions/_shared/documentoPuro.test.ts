import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { imagemValida, instrucoesDeLeitura, normalizarLeitura, numeroBr } from "./documentoPuro.ts";

// Leitura de nota por foto (issues #362 e #369): a IA só lê; o que não confere volta vazio.
const ctx = {
  hoje: "2026-11-12",
  categorias: [
    { slug: "combustivel", label: "Combustível" },
    { slug: "manutencao", label: "Manutenção" },
    { slug: "alimentacao", label: "Alimentação" },
    { slug: "outro", label: "Outro" },
  ],
  tiposDeManutencao: ["Troca de óleo", "Freios", "Outro"],
};

Deno.test("numeroBr: formatos brasileiros e números", () => {
  assertEquals(numeroBr("1.234,56"), 1234.56);
  assertEquals(numeroBr("R$ 350,5"), 350.5);
  assertEquals(numeroBr(89.9), 89.9);
  assertEquals(numeroBr("12.5"), 12.5);
  assertEquals(numeroBr(""), null);
  assertEquals(numeroBr("abc"), null);
  assertEquals(numeroBr(Number.NaN), null);
});

Deno.test("cupom de diesel vira abastecimento com preço do litro calculado", () => {
  const l = normalizarLeitura(
    { tipo: "despesa", legivel: true, data: "2026-11-10", valor: "600,00", litros: 100, categoria: "combustivel", fornecedor: "  Posto  Carone ", placa: "abc-1d23" },
    ctx,
  );
  assertEquals(l.tipo, "abastecimento");
  assertEquals(l.categoria, "combustivel");
  assertEquals(l.valor, 600);
  assertEquals(l.preco_litro, 6);
  assertEquals(l.fornecedor, "Posto Carone");
  assertEquals(l.placa, "ABC-1D23");
  assertEquals(l.legivel, true);
});

Deno.test("oficina: manutenção com tipo da lista (sem acento também) e categoria", () => {
  const l = normalizarLeitura({ tipo: "manutencao", legivel: true, valor: 450, tipo_manutencao: "troca de oleo" }, ctx);
  assertEquals(l.tipo_manutencao, "Troca de óleo");
  assertEquals(l.categoria, "manutencao");
  const outro = normalizarLeitura({ tipo: "manutencao", legivel: true, valor: 450, tipo_manutencao: "alinhamento" }, ctx);
  assertEquals(outro.tipo_manutencao, "Outro");
  assertEquals(normalizarLeitura({ tipo: "despesa", valor: 10, tipo_manutencao: "Freios" }, ctx).tipo_manutencao, null);
});

Deno.test("o que não confere volta vazio em vez de chute", () => {
  const l = normalizarLeitura(
    { tipo: "qualquer", legivel: true, valor: -5, data: "2027-03-01", categoria: "inexistente", litros: 99999, preco_litro: 900, odometro_km: 0 },
    ctx,
  );
  assertEquals(l.tipo, "despesa");
  assertEquals(l.valor, null);
  assertEquals(l.legivel, false); // sem valor não dá para lançar
  assertEquals(l.data, null); // futuro
  assertEquals(l.categoria, "outro");
  assertEquals(l.litros, null);
  assertEquals(l.preco_litro, null);
  assertEquals(l.odometro_km, null);
  assertEquals(normalizarLeitura({ valor: 10, data: "2024-01-01" }, ctx).data, null); // mais de um ano atrás
  assertEquals(normalizarLeitura({ valor: 10, data: "2026-02-30" }, ctx).data, null); // dia que não existe
  assertEquals(normalizarLeitura({ valor: 10, data: "2026-11-13" }, ctx).data, "2026-11-13"); // amanhã (fuso) passa
  assertEquals(normalizarLeitura(null, ctx).legivel, false);
  assertEquals(normalizarLeitura({ legivel: false, valor: 30 }, ctx).legivel, false);
  assertEquals(normalizarLeitura({ valor: 10.456 }, ctx).valor, 10.46);
});

Deno.test("instruções citam as categorias, os tipos e o tipo esperado", () => {
  const s = instrucoesDeLeitura({ ...ctx, tipoEsperado: "abastecimento" });
  assertStringIncludes(s, "combustivel: Combustível");
  assertStringIncludes(s, "Troca de óleo");
  assertStringIncludes(s, "Hoje é 2026-11-12");
  assertStringIncludes(s, "tela de abastecimento");
  assert(!instrucoesDeLeitura(ctx).includes("tela de"));
});

Deno.test("imagemValida: tipo, tamanho e base64", () => {
  const ok = imagemValida({ imagem: `data:image/jpeg;base64,${"A".repeat(200)}`, media_type: "image/jpeg" });
  assert(ok.ok);
  if (ok.ok) assertEquals(ok.dados.length, 200);
  assertEquals(imagemValida({ imagem: "A".repeat(200), media_type: "application/pdf" }).ok, false);
  assertEquals(imagemValida({ imagem: "AAA" }).ok, false);
  assertEquals(imagemValida({ imagem: "A".repeat(7_000_001) }).ok, false);
  assertEquals(imagemValida({ imagem: `${"A".repeat(200)}<script>` }).ok, false);
});
