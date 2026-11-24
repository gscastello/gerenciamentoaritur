import { assert, assertEquals } from "jsr:@std/assert";
import type { MensagemDaConversa } from "./agentePuro.ts";
import { MUDOU_DEPOIS } from "./avaliacaoPura.ts";
import {
  type AcaoDaProva,
  compararProva,
  criadoAntes,
  custoMensal,
  historicoDoTurno,
  MAX_TURNOS,
  pedeConfirmacao,
  terminaPerguntando,
  turnosDoCliente,
} from "./provaPura.ts";

Deno.test("#504 prova: 'criado antes' compara horário, não texto (fusos diferentes)", () => {
  // criada 36 min DEPOIS da primeira mensagem, mas como texto "22T23" < "23T02" (caso f471b58e)
  assertEquals(criadoAntes("2026-11-22T23:41:46.911351-03:00", "2026-11-23T02:05:51.709Z"), false);
  assertEquals(criadoAntes("2026-11-22T22:00:00-03:00", "2026-11-23T02:05:51.709Z"), true);
  assertEquals(criadoAntes("2026-11-23T01:00:00+00:00", "2026-11-23T02:05:51.709Z"), true);
  // sem data legível: conta como depois (não vaza para a prova)
  assertEquals(criadoAntes(null, "2026-11-23T02:05:51.709Z"), false);
  assertEquals(criadoAntes("ontem", "2026-11-23T02:05:51.709Z"), false);
});

const m = (quem: MensagemDaConversa["quem"], texto: string, em: string): MensagemDaConversa => ({ quem, texto, em: `2026-11-20T${em}:00.000Z` });

Deno.test("#501 prova: mensagens seguidas do cliente são um turno; a equipe fecha o turno e sai", () => {
  const msgs = [
    m("cliente", "bom dia", "10:00"),
    m("cliente", "quero ir amanhã", "10:01"),
    m("equipe", "de onde?", "10:05"),
    m("cliente", "do Cohatrac", "10:06"),
    m("cliente", "rua 10", "10:20"), // 14 min depois: outro turno
    m("bot", "rascunho", "10:21"),
  ];
  const t = turnosDoCliente(msgs, Date.parse("2026-11-20T23:00:00Z"));
  assertEquals(t.map((x) => x.mensagens.map((y) => y.texto)), [["bom dia", "quero ir amanhã"], ["do Cohatrac"], ["rua 10"]]);
  assertEquals(t[0].em, "2026-11-20T10:01:00.000Z");
  // o que veio depois da marca não entra
  assertEquals(turnosDoCliente(msgs, Date.parse("2026-11-20T10:02:00Z")).length, 1);
});

Deno.test("#501 prova: conversa longa fica com os últimos turnos", () => {
  const msgs: MensagemDaConversa[] = [];
  for (let i = 0; i < MAX_TURNOS + 5; i++) {
    const em = Date.parse("2026-11-20T08:00:00Z") + i * 10 * 60 * 1000;
    msgs.push({ quem: "cliente", texto: `c${i}`, em: new Date(em).toISOString() });
    msgs.push({ quem: "equipe", texto: "ok", em: new Date(em + 1000).toISOString() });
  }
  const t = turnosDoCliente(msgs, Number.MAX_SAFE_INTEGER);
  assertEquals(t.length, MAX_TURNOS);
  assertEquals(t[t.length - 1].mensagens[0].texto, `c${MAX_TURNOS + 4}`);
});

Deno.test("#501 prova: o histórico do turno tem o cliente e as respostas do atendente, não as da equipe", () => {
  const turnos = turnosDoCliente([m("cliente", "oi", "10:00"), m("equipe", "olá", "10:01"), m("cliente", "amanhã", "10:02")], Number.MAX_SAFE_INTEGER);
  const h = historicoDoTurno(turnos, ["Olá! Para que dia?", null], 1);
  assertEquals(h.map((x) => `${x.quem}:${x.texto}`), ["cliente:oi", "bot:Olá! Para que dia?", "cliente:amanhã"]);
  // a resposta fica entre os turnos (ordem por horário)
  assert(h[1].em > h[0].em && h[1].em < h[2].em);
  assertEquals(historicoDoTurno(turnos, [], 0).map((x) => x.texto), ["oi"]);
});

const esperada = { trip_date: "2026-11-21", direction: "ida", route_point_code: "busca", quantity: 1, pickup_neighborhood: "Cohatrac", unit_price: 60 };
const criar = (o: Partial<Extract<AcaoDaProva, { tipo: "criar" }>> = {}): AcaoDaProva => ({
  tipo: "criar",
  id: "prova-1",
  trip_date: "2026-11-21",
  direction: "ida",
  route_point_code: "busca",
  quantity: 1,
  pickup_neighborhood: "Cohatrac",
  pickup_detail: "rua 10",
  dropoff_location: null,
  unit_price: 60,
  status: "confirmada",
  turno: 1,
  ...o,
});

Deno.test("#501 prova: reserva igual à que ficou é certo; dia, sentido, quantidade e preço errados são erro grave", () => {
  assertEquals(compararProva([esperada], [criar()]).resultado, "certo");
  assertEquals(compararProva([esperada], [criar({ trip_date: "2026-11-22" })]).resultado, "errado");
  assertEquals(compararProva([esperada], [criar({ direction: "volta" })]).resultado, "errado");
  assertEquals(compararProva([esperada], [criar({ quantity: 2 })]).resultado, "errado");
  const preco = compararProva([esperada], [criar({ unit_price: 50 })]);
  assertEquals(preco.resultado, "errado");
  assert(preco.diferencas.some((d) => d.startsWith("preço: 50 ≠ 60")));
  // sem preço conhecido de um dos lados, não acusa
  assertEquals(compararProva([{ ...esperada, unit_price: null }], [criar({ unit_price: 50 })]).resultado, "certo");
});

Deno.test("#501 prova: reserva cancelada na própria prova não conta; mexer em reserva que já existia é para conferir", () => {
  assertEquals(compararProva([esperada], [criar({ trip_date: "2026-11-22", cancelada: true }), criar({ id: "prova-2" })]).resultado, "certo");
  const r = compararProva([esperada], [criar(), { tipo: "cancelar", reserva_id: "abc", da_prova: false, turno: 2 }]);
  assertEquals(r.resultado, "errado");
  assert(r.diferencas.some((d) => d.includes("cancelaria a reserva abc")));
  assertEquals(compararProva([esperada], [criar(), { tipo: "remarcar", reserva_id: "prova-1", da_prova: true, turno: 2 }]).resultado, "certo");
});

Deno.test("#501 prova: passar para a equipe ou perguntar ao cliente é pendente; sumir calado é faltou", () => {
  assertEquals(compararProva([esperada], [{ tipo: "chamar_atendente", texto: "encomenda", turno: 0 }]).resultado, "pendente");
  assertEquals(compararProva([esperada], [], { ultimaResposta: "Qual o seu nome completo? 😊" }).resultado, "pendente");
  assertEquals(compararProva([esperada], [], { ultimaResposta: "Tudo certo, até amanhã!" }).resultado, "faltou");
  // a pergunta no meio da resposta também é esperar o cliente (caso d04e0972)
  assertEquals(compararProva([esperada], [], { ultimaResposta: "Anotei o embarque. Onde você vai descer? Se for em casa, me diga o bairro." }).resultado, "pendente");
  // fora da área: a reserva fica pendente para a equipe
  assertEquals(compararProva([esperada], [criar({ status: "pendente" })]).resultado, "pendente");
});

Deno.test("#501 prova: pergunta no fim da resposta", () => {
  assert(terminaPerguntando("Para que dia? 🙂"));
  assert(terminaPerguntando("Pode ser às 5h?"));
  assert(!terminaPerguntando("Reserva feita."));
  assert(!terminaPerguntando(null));
});

Deno.test("#501 prova: custo por mês pelas conversas por dia", () => {
  assertEquals(custoMensal(3, 300), 24.6); // US$ 0,01 por conversa × 82 × 30
  assertEquals(custoMensal(3, 0), 0);
  assertEquals(custoMensal(10, 100, 100), 300);
});

Deno.test("#501 prova: o 'sim' da prova só responde a pedido de confirmação do resumo", () => {
  assert(pedeConfirmacao("Resumo: segunda (23/11), Ida da Rodoviária, 2 passagens, R$ 120. Pagamento em dinheiro, pode ser? Posso confirmar?"));
  assert(pedeConfirmacao("Ida amanhã, busca no Cohatrac, 1 passagem.\nConfirma? 😊"));
  assert(pedeConfirmacao("Posso reservar assim?"));
  // a pergunta no meio, o resumo depois (caso b270f411)
  assert(pedeConfirmacao("Em Cantanhede a van passa entre 13h e 14h.\n\nQuer que eu reserve? Seria 1 passagem, descendo no Retorno, por R$ 60."));
  // nome de rua no resumo não é pergunta de dado (caso b270f411, 2ª rodada)
  assert(pedeConfirmacao("Quer que eu reserve para amanhã, saindo da entrada da Rua da Areia, em Cantanhede, com 1 passagem?"));
  // confirmação junto com pergunta de dado: falta o dado, não é o "sim"
  assert(!pedeConfirmacao("Posso confirmar? E qual o seu nome?"));
  // pergunta de dado: só o cliente sabe
  assert(!pedeConfirmacao("Certo! Qual o seu nome completo?"));
  assert(!pedeConfirmacao("Pode confirmar o endereço de embarque?"));
  assert(!pedeConfirmacao("Quantas passagens?"));
  assert(!pedeConfirmacao("Reserva confirmada! Até amanhã."));
  assert(!pedeConfirmacao(null));
});

Deno.test("#508: prova do atendente num caso que mudou depois da marca fica para conferir", () => {
  const e = { trip_date: "2026-11-24", direction: "ida", route_point_code: "retorno", quantity: 3, unit_price: 50 };
  const criada = { tipo: "criar" as const, trip_date: "2026-11-24", direction: "ida", route_point_code: "rodoviaria", quantity: 3, pickup_neighborhood: null, unit_price: 45 };
  // deno-lint-ignore no-explicit-any
  const acoes = [criada] as any;
  const r = compararProva([e], acoes, { mudouDepois: true });
  assertEquals(r.resultado, "pendente");
  assertEquals(r.diferencas[0], MUDOU_DEPOIS);
  // só o preço diferente também fica para conferir
  const soPreco = compararProva([{ ...e, route_point_code: "rodoviaria" }], acoes, { mudouDepois: true });
  assertEquals(soPreco.resultado, "pendente");
  assertEquals(soPreco.diferencas, [MUDOU_DEPOIS, "preço: 45 ≠ 50 (ida 2026-11-24)"]);
  // sem a marca: errado, como sempre
  assertEquals(compararProva([e], acoes).resultado, "errado");
});
