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
  // com o ponto junto (e o cliente disse depois da reserva), corrige
  const falas = [{ em: "2026-11-12T11:50:00Z", texto: "é a volta, saio de Cantanhede" }];
  const junto = decidirRevisao(
    achadosValidos([
      { reserva_id: "r1", campo: "sentido", valor_correto: "volta", evidencia: "é a volta, saio de Cantanhede", certeza: "alta" },
      { reserva_id: "r1", campo: "ponto", valor_correto: "cantanhede", evidencia: "saio de Cantanhede", certeza: "alta" },
    ]),
    { ...ctx, conversa: conv, falas },
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

Deno.test("revisor: dia/sentido só mudam sozinhos com prova DEPOIS da reserva; viagem que já saiu não é mexida", async () => {
  const { horaDaEvidencia } = await import("./revisaoPura.ts");
  // caso real: "pra São Luís aqui de Pirapemas" era do pedido ANTERIOR (Volta do dia 11); a reserva (Ida 12) está certa
  const ida = { ...base, id: "r9", data: "2026-11-12", ponto: "outro", embarque: "entrada da vila Itamar, próximo a PRF", criada_em: "2026-11-11T18:10:00Z" };
  const falas = [
    { em: "2026-11-10T23:49:00Z", texto: "queria reservar uma passagem pra São luiz aqui de pirapemas" },
    { em: "2026-11-11T16:46:00Z", texto: "queria reservar 3 vagas pra amanhã" },
    { em: "2026-11-11T16:47:00Z", texto: "vou esperar na entrada da vila Itamar" },
  ];
  const conv = falas.map((f) => f.texto).join("\n");
  assertEquals(horaDaEvidencia("pra São luiz aqui de pirapemas", falas), "2026-11-10T23:49:00Z");
  const achados = achadosValidos([
    { reserva_id: "r9", campo: "sentido", valor_correto: "volta", evidencia: "pra São luiz aqui de pirapemas", certeza: "alta" },
    { reserva_id: "r9", campo: "ponto", valor_correto: "pirapemas", evidencia: "pra São luiz aqui de pirapemas", certeza: "alta" },
  ]);
  const antes = decidirRevisao(achados, { reservas: [ida], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "06:00" });
  assertEquals(antes.correcoes.length, 0); // prova anterior à reserva: não muda sozinho
  assert(antes.pendencias.length >= 1);
  // a mesma Ida às 11h: a viagem já saiu, nada é mexido
  const saiu = decidirRevisao(achados, { reservas: [ida], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "11:00" });
  assertEquals(saiu.correcoes.length + saiu.pendencias.length, 0);
  // cliente corrigiu DEPOIS da reserva: corrige sozinho
  const depois = [...falas, { em: "2026-11-11T19:00:00Z", texto: "na verdade é dia 14" }];
  const r = decidirRevisao(
    achadosValidos([{ reserva_id: "r9", campo: "data", valor_correto: "2026-11-14", evidencia: "na verdade é dia 14", certeza: "alta" }]),
    { reservas: [ida], conversa: depois.map((f) => f.texto).join("\n"), hoje: "2026-11-12", pontos, falas: depois, horaAgora: "06:00" },
  );
  assertEquals(r.correcoes[0]?.data, "2026-11-14");
});

Deno.test("#343: correção do cliente depois da reserva é aplicada mesmo com certeza média", () => {
  const volta = { ...base, id: "r7", direcao: "volta" as const, ponto: "pirapemas", embarque: "Rua do Cajueiro", desembarque: "Em casa (bairro)", criada_em: "2026-11-12T15:14:53Z" };
  const falas = [
    { em: "2026-11-12T15:12:16Z", texto: "Rua do cajueiro" },
    { em: "2026-11-12T15:15:33Z", texto: "Ficaremos na rodoviária" },
  ];
  const conv = falas.map((f) => f.texto).join(" | ");
  const ach = achadosValidos([{ reserva_id: "r7", campo: "desembarque", valor_correto: "Rodoviária", evidencia: "Ficaremos na rodoviária", certeza: "media" }]);
  const r = decidirRevisao(ach, { reservas: [volta], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "14:00" });
  assertEquals(r.correcoes.length, 1);
  assertEquals(r.correcoes[0].desembarque, "Rodoviária");
  // a mesma fala ANTES da reserva, com certeza média: continua pendência
  const antes = decidirRevisao(ach, { reservas: [{ ...volta, criada_em: "2026-11-12T16:00:00Z" }], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "14:00" });
  assertEquals(antes.correcoes.length, 0);
  assertEquals(antes.pendencias.length, 1);
  // dia com certeza média, mesmo depois: pendência (muda a viagem inteira)
  const dia = decidirRevisao(
    achadosValidos([{ reserva_id: "r7", campo: "data", valor_correto: "2026-11-16", evidencia: "Ficaremos na rodoviária", certeza: "media" }]),
    { reservas: [volta], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "14:00" },
  );
  assertEquals(dia.correcoes.length, 0);
});

Deno.test("#389: o que a equipe mudou à mão vence a conversa anterior; cliente depois vira pendência", async () => {
  const { camposMudadosPelaEquipe } = await import("./revisaoPura.ts");
  const BOT = "bot-id";
  // caso real: 4 passageiras no mesmo embarque; pelo Assistente o dono tirou uma (4 → 3)
  const logs = [
    { performed_by: BOT, performed_at: "2026-11-13T10:00:00Z", before_data: { quantity: 1 }, after_data: { quantity: 4 } },
    { performed_by: "dono", performed_at: "2026-11-13T12:00:00Z", before_data: { quantity: 4, pickup_detail: "Piralanches" }, after_data: { quantity: 3, pickup_detail: "Piralanches" } },
    { performed_by: null, performed_at: "2026-11-13T12:05:00Z", before_data: { trip_id: "a" }, after_data: { trip_id: "b" } },
  ];
  const mudou = camposMudadosPelaEquipe(logs, BOT);
  assertEquals(mudou, { quantidade: "2026-11-13T12:00:00Z" }); // o bot e o ator vazio não contam; embarque não mudou

  const r = { ...base, id: "r1", quantidade: 3, criada_em: "2026-11-13T10:00:00Z" };
  const falas = [{ em: "2026-11-13T09:50:00Z", texto: "são 4 pessoas no Piralanches" }];
  const ach = achadosValidos([
    { reserva_id: "r1", campo: "quantidade", valor_atual: "3", valor_correto: "4", evidencia: "são 4 pessoas no Piralanches", certeza: "alta" },
  ]);
  const ctxEquipe = { reservas: [r], conversa: falas[0].texto, hoje: "2026-11-12", pontos, falas, horaAgora: "08:00", mudancasDaEquipe: { r1: mudou } };
  const d = decidirRevisao(ach, ctxEquipe);
  assertEquals(d.correcoes.length, 0); // não volta para 4
  assertEquals(d.pendencias.length, 0);
  assertEquals(d.descartados.length, 1);
  // o cliente escreveu DEPOIS da mudança da equipe: pendência, nunca correção sozinha
  const falasDepois = [...falas, { em: "2026-11-13T13:00:00Z", texto: "na verdade somos 4 no Piralanches" }];
  const achDepois = achadosValidos([
    { reserva_id: "r1", campo: "quantidade", valor_correto: "4", evidencia: "na verdade somos 4 no Piralanches", certeza: "alta" },
  ]);
  const d2 = decidirRevisao(achDepois, { ...ctxEquipe, falas: falasDepois, conversa: falasDepois.map((f) => f.texto).join("\n") });
  assertEquals(d2.correcoes.length, 0);
  assertEquals(d2.pendencias.length, 1);
  // sem mudança da equipe nesse campo, o revisor segue corrigindo como antes
  const d3 = decidirRevisao(ach, { ...ctxEquipe, mudancasDaEquipe: {} });
  assertEquals(d3.correcoes[0]?.quantidade, 4);
});

Deno.test("#377: prova que junta a pergunta da equipe e a resposta do cliente corrige o dia", async () => {
  const { horaDaEvidencia, partesDaEvidencia } = await import("./revisaoPura.ts");
  // caso real: Agendado lançou sexta (13/11); a equipe perguntou o dia e o cliente disse "Sábado"
  const ida = { ...base, id: "r5", data: "2026-11-13", ponto: "busca", bairro: "Paço", criada_em: "2026-11-12T16:40:59Z" };
  const falas = [
    { em: "2026-11-12T16:40:10Z", texto: "Agendado ☑️" },
    { em: "2026-11-12T16:40:40Z", texto: "Qual dia mesmo da sua viagem?" },
    { em: "2026-11-12T16:41:20Z", texto: "Sábado" },
    { em: "2026-11-12T16:41:50Z", texto: "ok vou corrigir" },
  ];
  // a conversa que o revisor manda tem a hora e quem falou em cada linha
  const conv = `[12/11 13:40] EQUIPE: Agendado ☑️
[12/11 13:40] EQUIPE: Qual dia mesmo da sua viagem?
[12/11 13:41] CLIENTE: Sábado
[12/11 13:41] EQUIPE: ok vou corrigir`;
  const prova = "EQUIPE: Qual dia mesmo da sua viagem? / CLIENTE: Sábado";
  assertEquals(partesDaEvidencia(prova), ["qual dia mesmo da sua viagem", "sabado"]);
  assertEquals(evidenciaNaConversa(prova, conv), true);
  assertEquals(horaDaEvidencia(prova, falas), "2026-11-12T16:41:20Z"); // a hora da resposta
  const r = decidirRevisao(
    achadosValidos([
      { reserva_id: "r5", campo: "data", valor_atual: "2026-11-13", valor_correto: "2026-11-14", evidencia: prova, certeza: "alta", quem_errou: "bot" },
    ]),
    { reservas: [ida], conversa: conv, hoje: "2026-11-12", pontos, falas, horaAgora: "13:45" },
  );
  assertEquals(r.correcoes.length, 1);
  assertEquals(r.correcoes[0].data, "2026-11-14");
  // uma parte que não está na conversa derruba a prova inteira
  assertEquals(evidenciaNaConversa("EQUIPE: Qual dia mesmo da sua viagem? / CLIENTE: Domingo", conv), false);
  // data com barra não é separador; hora/rótulo saem; partes curtas demais são ignoradas
  assertEquals(partesDaEvidencia("[12/11 13:41] CLIENTE: dia 14/11 | ok"), ["dia 14 11"]);
  assertEquals(partesDaEvidencia("oi / ok"), []);
  assertEquals(evidenciaNaConversa("oi / ok", conv), false);
});

Deno.test("#401: Ida virou Volta: embarque e desembarque trocam junto com o sentido", () => {
  const ida = {
    ...base,
    id: "r22",
    data: "2026-11-22",
    ponto: "busca",
    bairro: "Cohab Anil III",
    embarque: "Condomínio home Practice",
    desembarque: "Praça da Cruz",
    criada_em: "2026-11-14T13:01:00Z",
  };
  const falas = [{ em: "2026-11-14T13:05:00Z", texto: "Volta - Cantanhede para São Luís - 22/11" }];
  const achados = achadosValidos([
    { reserva_id: "r22", campo: "sentido", valor_correto: "volta", evidencia: "Volta - Cantanhede para São Luís - 22/11", certeza: "alta" },
    { reserva_id: "r22", campo: "ponto", valor_correto: "cantanhede", evidencia: "Volta - Cantanhede para São Luís - 22/11", certeza: "alta" },
    { reserva_id: "r22", campo: "embarque", valor_correto: "Praça da Cruz", evidencia: "Volta - Cantanhede para São Luís", certeza: "media" },
  ]);
  const r = decidirRevisao(achados, { reservas: [ida], conversa: falas[0].texto, hoje: "2026-11-14", pontos, falas, horaAgora: "10:15" });
  assertEquals(r.correcoes.length, 1);
  const c = r.correcoes[0];
  assertEquals(c.sentido, "volta");
  assertEquals(c.embarque, "Praça da Cruz");
  assertEquals(c.desembarque, "Condomínio home Practice, Cohab Anil III");
  assertEquals(c.bairro, null);
  assertEquals(r.pendencias.length, 0);
});
