import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  achadosValidos,
  decidirRevisao,
  duplicadasDaRevisao,
  evidenciaNaConversa,
  instrucoesDoRevisor,
  precoRevisado,
  type ReservaRevisada,
  reservasParaOPrompt,
} from "./revisaoPura.ts";

const pontos = { ida: ["busca", "rodoviaria", "retorno", "outro"], volta: ["pirapemas", "cantanhede"] };
const base: ReservaRevisada = {
  id: "r1",
  data: "2026-11-14",
  direcao: "ida",
  trip_id: "t-ida-14",
  ponto: "rodoviaria",
  bairro: null,
  embarque: "Parada das vans (São Luís)",
  desembarque: "Cantanhede",
  quantidade: 1,
  valor: 60,
  tipo: "passagem",
  status: "confirmada",
  criada_pelo_bot: true,
  criada_em: "2026-11-12T11:00:00Z",
};
const conversa = `[12/11 08:40] CLIENTE: Quero passagem dia 14, vou estar na parada das vans
[12/11 08:41] CLIENTE: na verdade são 2 pessoas
[12/11 08:42] EQUIPE: Agendado ☑️`;
const ctx = { reservas: [base], conversa, hoje: "2026-11-12", pontos };

Deno.test("revisor: evidência tem de estar na conversa", () => {
  assertEquals(evidenciaNaConversa("na verdade são 2 pessoas", conversa), true);
  assertEquals(evidenciaNaConversa("Na Verdade, SÃO 2 pessoas!", conversa), true);
  assertEquals(evidenciaNaConversa("são 3 pessoas", conversa), false);
  assertEquals(evidenciaNaConversa("oi", conversa), false);
});

Deno.test("revisor: corrige sozinho só com prova e certeza alta; junta os campos da mesma reserva", () => {
  const achados = achadosValidos([
    { reserva_id: "r1", campo: "quantidade", valor_atual: "1", valor_correto: "2", evidencia: "na verdade são 2 pessoas", certeza: "alta", quem_errou: "bot" },
    { reserva_id: "r1", campo: "ponto", valor_atual: "rodoviaria", valor_correto: "retorno", evidencia: "vou estar na parada das vans", certeza: "alta" },
    { reserva_id: "r1", campo: "desembarque", valor_correto: "Pirapemas", evidencia: "vou para Pirapemas", certeza: "alta" }, // sem prova
    { reserva_id: "r1", campo: "tipo", valor_correto: "encomenda", evidencia: "Quero passagem dia 14", certeza: "alta" }, // tipo: pendência
    { reserva_id: "r1", campo: "data", valor_correto: "2026-11-14", evidencia: "Quero passagem dia 14", certeza: "alta" }, // igual: descarta
    { reserva_id: "r1", campo: "bairro", valor_correto: "Turu", evidencia: "vou estar na parada das vans", certeza: "media" }, // média: pendência
    { reserva_id: "rX", campo: "data", valor_correto: "2026-11-15", evidencia: "dia 14", certeza: "alta" }, // outra reserva
    { campo: "preco", reserva_id: "r1", evidencia: "x", valor_correto: "60" }, // campo inválido some
  ]);
  assertEquals(achados.length, 7);
  const r = decidirRevisao(achados, ctx);
  assertEquals(r.correcoes.length, 1);
  assertEquals(r.correcoes[0].quantidade, 2);
  assertEquals(r.correcoes[0].ponto, "retorno");
  assertEquals(r.correcoes[0].motivos.length, 2);
  assertEquals(r.pendencias.map((a) => a.campo).sort(), ["bairro", "tipo"]);
  assertEquals(r.descartados.map((a) => a.campo).sort(), ["data", "data", "desembarque"]);
});

Deno.test("revisor: data no passado ou ponto de outro sentido não são corrigidos sozinhos", () => {
  const conv = `${conversa}\n[12/11 08:50] CLIENTE: é a volta, saio de Cantanhede`;
  const passado = decidirRevisao(
    achadosValidos([{ reserva_id: "r1", campo: "data", valor_correto: "2026-11-10", evidencia: "Quero passagem dia 14", certeza: "alta" }]),
    { ...ctx, conversa: conv },
  );
  assertEquals(passado.correcoes.length, 0);
  assertEquals(passado.pendencias.length, 1);
  // virou Volta mas o ponto (rodoviária) não existe na Volta: tudo vira pendência
  const sentido = decidirRevisao(
    achadosValidos([{ reserva_id: "r1", campo: "sentido", valor_correto: "volta", evidencia: "é a volta, saio de Cantanhede", certeza: "alta" }]),
    { ...ctx, conversa: conv },
  );
  assertEquals(sentido.correcoes.length, 0);
  assertEquals(sentido.pendencias.length, 1);
  // com o ponto junto, corrige
  const junto = decidirRevisao(
    achadosValidos([
      { reserva_id: "r1", campo: "sentido", valor_correto: "volta", evidencia: "é a volta, saio de Cantanhede", certeza: "alta" },
      { reserva_id: "r1", campo: "ponto", valor_correto: "cantanhede", evidencia: "saio de Cantanhede", certeza: "alta" },
    ]),
    { ...ctx, conversa: conv },
  );
  assertEquals(junto.correcoes.length, 1);
  assertEquals(junto.correcoes[0].sentido, "volta");
  assertEquals(junto.correcoes[0].ponto, "cantanhede");
});

Deno.test("revisor: duplicada do bot cancela a mais nova; com reserva da equipe vira pendência", () => {
  const dup = { ...base, id: "r2", criada_em: "2026-11-12T11:00:18Z" };
  assertEquals(duplicadasDaRevisao([base, dup]), { cancelar: ["r2"], pendentes: [] });
  const daEquipe = { ...dup, criada_pelo_bot: false };
  assertEquals(duplicadasDaRevisao([base, daEquipe]), { cancelar: [], pendentes: [["r1", "r2"]] });
  assertEquals(duplicadasDaRevisao([base, { ...dup, trip_id: "t-volta-15" }]).cancelar, []);
  assertEquals(duplicadasDaRevisao([base, { ...dup, status: "cancelada" }]).cancelar, []);
});

Deno.test("revisor: preço só pela tabela", () => {
  assertEquals(precoRevisado({ atual: 0, tabela: 80, alteradoPelaEquipe: true }), 80);
  assertEquals(precoRevisado({ atual: null, tabela: 80, alteradoPelaEquipe: false }), 80);
  assertEquals(precoRevisado({ atual: 60, tabela: 80, alteradoPelaEquipe: false }), 80);
  assertEquals(precoRevisado({ atual: 60, tabela: 80, alteradoPelaEquipe: true }), null);
  assertEquals(precoRevisado({ atual: 80, tabela: 80, alteradoPelaEquipe: false }), null);
  assertEquals(precoRevisado({ atual: 0, tabela: null, alteradoPelaEquipe: false }), null);
});

Deno.test("revisor: texto das reservas e instruções", () => {
  const t = reservasParaOPrompt([base], { rodoviaria: "Rodoviária" });
  assertStringIncludes(t, "reserva_id=r1");
  assertStringIncludes(t, "Ida 14/11 (2026-11-14)");
  assertStringIncludes(t, "ponto rodoviaria (Rodoviária)");
  const i = instrucoesDoRevisor({ pontos: "- ida: rodoviaria = Rodoviária", hoje: "2026-11-12" });
  assertStringIncludes(i, "copie LITERALMENTE");
  assert(i.includes("Não aponte preço"));
});
